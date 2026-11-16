import { Inject, Injectable } from "@nestjs/common";
import type { Queryable, TxRunner } from "@velaq/db";
import type { Principal } from "../auth/principal.js";
import { BREACH_CHECKER, type BreachChecker } from "./breach.js";
import {
  dummyPasswordHash,
  hashEmailCode,
  hashPassword,
  hashToken,
  newEmailCode,
  newSessionToken,
  safeEqual,
  verifyPassword,
} from "./crypto.js";
import { type Email, MAILER, type Mailer, emails } from "./mailer.js";
import { uuidv7 } from "./uuid.js";

export const IDENTITY_DB = Symbol("IDENTITY_DB");
export const IDENTITY_CONFIG = Symbol("IDENTITY_CONFIG");

export type Product = Principal["product"];
type CodePurpose = "verify_email" | "reset_password";

export interface IdentityConfig {
  /** Secret used to HMAC email codes. */
  codeSecret: string;
  /** The product this API serves; sessions are issued for and accepted from this product only. */
  product: Product;
}

export const LIMITS = {
  codeTtlMinutes: 10,
  codeMaxAttempts: 5,
  sessionDays: 30,
  sessionIdleDays: 7,
  passwordMin: 12,
  passwordMax: 128,
} as const;

/** Rate limits: [max requests, window in seconds]. */
const RATE = {
  signUpPerIp: [10, 3600],
  signInPerEmail: [10, 900],
  signInPerIp: [50, 900],
  codeSendPerEmail: [5, 3600],
  codeCheckPerIp: [30, 900],
} as const satisfies Record<string, readonly [number, number]>;

export interface SessionOut {
  token: string;
  expiresAt: string;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Errors the controller turns into HTTP responses. Messages are safe to show to users. */
export class IdentityError extends Error {
  constructor(
    readonly code: "rate_limited" | "invalid_credentials" | "invalid_code" | "breached_password" | "email_failed",
    message: string,
  ) {
    super(message);
  }
}

export interface PersonName {
  firstName: string;
  lastName: string;
}

interface AccountRow {
  id: string;
  email: string;
  first_name: string | null;
  password_hash: string;
  email_verified_at: string | null;
  status: string;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * FND-001 Identity: email and password with email codes, and server-side sessions.
 * Responses never reveal whether an email has an account.
 */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(IDENTITY_DB) private readonly db: TxRunner,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(BREACH_CHECKER) private readonly breaches: BreachChecker,
  ) {}

  /** Start sign-up. Always ends with "check your email", whether or not the email is new. */
  async signUp(emailIn: string, password: string, name: PersonName, meta: RequestMeta): Promise<void> {
    const email = normaliseEmail(emailIn);
    await this.limit(`signup:ip:${meta.ip}`, RATE.signUpPerIp);
    await this.assertPasswordAllowed(password);
    await this.limit(`code:email:${email}`, RATE.codeSendPerEmail);

    const existing = await this.findAccount(email);
    if (existing?.email_verified_at) {
      await this.deliver(emails.alreadyRegistered(email, existing.first_name));
      await this.event(existing.id, "sign_up_existing", meta);
      return;
    }
    const passwordHash = await hashPassword(password);
    let accountId: string;
    if (existing) {
      // Unconfirmed accounts can be claimed again, so nobody can block an email by signing it up first.
      accountId = existing.id;
      await this.db.query(
        "UPDATE accounts SET password_hash = $2, first_name = $3, last_name = $4, password_changed_at = now() WHERE id = $1",
        [accountId, passwordHash, name.firstName, name.lastName],
      );
    } else {
      accountId = uuidv7();
      await this.db.query(
        `INSERT INTO accounts (id, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name
         WHERE accounts.email_verified_at IS NULL`,
        [accountId, email, passwordHash, name.firstName, name.lastName],
      );
      const row = await this.findAccount(email);
      if (!row || row.email_verified_at) return;
      accountId = row.id;
    }
    await this.sendCode(accountId, email, name.firstName, "verify_email");
    await this.event(accountId, "sign_up", meta);
  }

  /** Confirm the email with the code; signs the person in. */
  async verifyEmail(emailIn: string, code: string, meta: RequestMeta): Promise<SessionOut> {
    const email = normaliseEmail(emailIn);
    await this.limit(`check:ip:${meta.ip}`, RATE.codeCheckPerIp);
    const account = await this.findAccount(email);
    if (!account || account.status !== "active" || !(await this.consumeCode(account.id, "verify_email", code))) {
      throw new IdentityError("invalid_code", "That code is wrong or has expired. Check the latest email, or send a new code.");
    }
    await this.db.query("UPDATE accounts SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [account.id]);
    await this.event(account.id, "email_verified", meta);
    return this.createSession(account.id, meta);
  }

  /** Sign in. An unconfirmed account with the right password gets a fresh code instead of a session. */
  async signIn(emailIn: string, password: string, meta: RequestMeta): Promise<{ session: SessionOut } | { next: "verify_email" }> {
    const email = normaliseEmail(emailIn);
    await this.limit(`signin:email:${email}`, RATE.signInPerEmail);
    await this.limit(`signin:ip:${meta.ip}`, RATE.signInPerIp);

    const account = await this.findAccount(email);
    const ok = await verifyPassword(password, account?.password_hash ?? (await dummyPasswordHash()));
    if (!account || !ok || account.status !== "active") {
      await this.event(account?.id ?? null, "sign_in_failed", meta);
      throw new IdentityError("invalid_credentials", "Email or password is incorrect.");
    }
    if (!account.email_verified_at) {
      await this.limit(`code:email:${email}`, RATE.codeSendPerEmail);
      await this.sendCode(account.id, email, account.first_name, "verify_email");
      return { next: "verify_email" };
    }
    await this.event(account.id, "sign_in", meta);
    return { session: await this.createSession(account.id, meta) };
  }

  /** Send another code. Silent when the email has no account, or nothing is waiting to be confirmed. */
  async resendCode(emailIn: string, purpose: CodePurpose, meta: RequestMeta): Promise<void> {
    const email = normaliseEmail(emailIn);
    await this.limit(`code:email:${email}`, RATE.codeSendPerEmail);
    const account = await this.findAccount(email);
    if (!account || account.status !== "active") return;
    if (purpose === "verify_email" && account.email_verified_at) return;
    await this.sendCode(account.id, email, account.first_name, purpose);
    await this.event(account.id, `code_resent_${purpose}`, meta);
  }

  async forgotPassword(emailIn: string, meta: RequestMeta): Promise<void> {
    await this.resendCode(emailIn, "reset_password", meta);
  }

  /** Set a new password with the emailed code. Signs out every other session, then signs in here. */
  async resetPassword(emailIn: string, code: string, password: string, meta: RequestMeta): Promise<SessionOut> {
    const email = normaliseEmail(emailIn);
    await this.limit(`check:ip:${meta.ip}`, RATE.codeCheckPerIp);
    await this.assertPasswordAllowed(password);
    const account = await this.findAccount(email);
    if (!account || account.status !== "active" || !(await this.consumeCode(account.id, "reset_password", code))) {
      throw new IdentityError("invalid_code", "That code is wrong or has expired. Check the latest email, or send a new code.");
    }
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      // Receiving the code proves control of the email, so it also confirms the address.
      await tx.query(
        "UPDATE accounts SET password_hash = $2, password_changed_at = now(), email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1",
        [account.id, passwordHash],
      );
      await tx.query("UPDATE sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL", [account.id]);
    });
    await this.event(account.id, "password_reset", meta);
    return this.createSession(account.id, meta);
  }

  /** Name and email for an account, used where the person isn't signed in, such as their shared profile. */
  async accountName(accountId: string): Promise<{ firstName: string | null; lastName: string | null; email: string } | null> {
    const r = await this.db.query<{ first_name: string | null; last_name: string | null; email: string }>(
      "SELECT first_name, last_name, email FROM accounts WHERE id = $1 AND status = 'active'",
      [accountId],
    );
    const a = r.rows[0];
    return a ? { firstName: a.first_name, lastName: a.last_name, email: a.email } : null;
  }

  /** Change the name on the account. */
  async updateName(accountId: string, name: PersonName, meta: RequestMeta): Promise<PersonName> {
    await this.db.query("UPDATE accounts SET first_name = $2, last_name = $3 WHERE id = $1", [accountId, name.firstName, name.lastName]);
    await this.event(accountId, "name_changed", meta);
    return name;
  }

  /** Ends every session for the account, on every device. */
  async signOutEverywhere(accountId: string, meta: RequestMeta): Promise<number> {
    const r = await this.db.query<{ id: string }>(
      "UPDATE sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL RETURNING id",
      [accountId],
    );
    await this.event(accountId, "sign_out_everywhere", meta);
    return r.rows.length;
  }

  async signOut(token: string): Promise<void> {
    await this.db.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [hashToken(token)]);
  }

  /** Check a session token. Returns null for unknown, expired, idle, revoked or other-product sessions. */
  async verifySession(token: string): Promise<Principal | null> {
    if (token.length < 20 || token.length > 100) return null;
    const r = await this.db.query<{
      id: string; account_id: string; email: string; first_name: string | null; last_name: string | null; product: Principal["product"]; expires_at: string | Date; last_seen_at: string | Date;
    }>(
      `SELECT s.id, s.account_id, a.email, a.first_name, a.last_name, s.product, s.expires_at, s.last_seen_at
       FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
         AND s.last_seen_at > now() - make_interval(days => $2)
         AND a.status = 'active'`,
      [hashToken(token), LIMITS.sessionIdleDays],
    );
    const s = r.rows[0];
    if (!s || s.product !== this.config.product) return null;
    if (Date.now() - new Date(s.last_seen_at).getTime() > 5 * 60_000) {
      await this.db.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [s.id]);
    }
    return {
      accountId: s.account_id,
      sessionId: s.id,
      email: s.email,
      firstName: s.first_name,
      lastName: s.last_name,
      product: s.product,
      expiresAt: new Date(s.expires_at).toISOString(),
    };
  }

  // ---------------------------------------------------------------------------------------------

  private async assertPasswordAllowed(password: string): Promise<void> {
    if (await this.breaches.isBreached(password)) {
      throw new IdentityError("breached_password", "This password has appeared in a data breach. Choose a different one.");
    }
  }

  private async findAccount(email: string): Promise<AccountRow | undefined> {
    const r = await this.db.query<AccountRow>(
      "SELECT id, email, first_name, password_hash, email_verified_at, status FROM accounts WHERE email = $1",
      [email],
    );
    return r.rows[0];
  }

  private async sendCode(accountId: string, email: string, firstName: string | null, purpose: CodePurpose): Promise<void> {
    const code = newEmailCode();
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      // Only the newest code works.
      await tx.query("UPDATE email_codes SET consumed_at = now() WHERE account_id = $1 AND purpose = $2 AND consumed_at IS NULL", [accountId, purpose]);
      await tx.query(
        "INSERT INTO email_codes (id, account_id, purpose, code_hash, expires_at) VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))",
        [id, accountId, purpose, hashEmailCode(this.config.codeSecret, id, code), LIMITS.codeTtlMinutes],
      );
    });
    await this.deliver(purpose === "verify_email" ? emails.verify(email, code, firstName) : emails.reset(email, code, firstName));
  }

  /**
   * Sends an email, turning a failure into a clear message for the person instead of a server error.
   * The log keeps the provider's reason (never the address or the code) so it can be fixed.
   */
  private async deliver(email: Email): Promise<void> {
    try {
      await this.mailer.send(email);
    } catch (e) {
      console.error(`Email not sent: ${e instanceof Error ? e.message : String(e)}`);
      throw new IdentityError("email_failed", "We couldn't send the email with your code just now. Try again in a few minutes.");
    }
  }

  private async consumeCode(accountId: string, purpose: CodePurpose, code: string): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;
    return this.db.transaction(async (tx: Queryable) => {
      const r = await tx.query<{ id: string; code_hash: string; attempts: number }>(
        `SELECT id, code_hash, attempts FROM email_codes
         WHERE account_id = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [accountId, purpose],
      );
      const row = r.rows[0];
      if (!row || row.attempts >= LIMITS.codeMaxAttempts) return false;
      if (!safeEqual(row.code_hash, hashEmailCode(this.config.codeSecret, row.id, code))) {
        await tx.query("UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
        return false;
      }
      await tx.query("UPDATE email_codes SET consumed_at = now() WHERE id = $1", [row.id]);
      return true;
    });
  }

  private async createSession(accountId: string, meta: RequestMeta): Promise<SessionOut> {
    const token = newSessionToken();
    const r = await this.db.query<{ expires_at: string | Date }>(
      `INSERT INTO sessions (id, account_id, token_hash, product, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5), $6, $7) RETURNING expires_at`,
      [uuidv7(), accountId, hashToken(token), this.config.product, LIMITS.sessionDays, meta.ip, meta.userAgent?.slice(0, 300) ?? null],
    );
    return { token, expiresAt: new Date(r.rows[0]!.expires_at).toISOString() };
  }

  /** Fixed-window counter shared by every API instance through the database. */
  private async limit(key: string, [max, windowSeconds]: readonly [number, number]): Promise<void> {
    const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
    const r = await this.db.query<{ count: number }>(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`,
      [key, windowStart],
    );
    if (Math.random() < 0.01) {
      await this.db.query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'");
    }
    if ((r.rows[0]?.count ?? 0) > max) {
      throw new IdentityError("rate_limited", "Too many attempts. Wait a few minutes and try again.");
    }
  }

  private async event(accountId: string | null, type: string, meta: RequestMeta): Promise<void> {
    await this.db.query("INSERT INTO auth_events (id, account_id, type, ip) VALUES ($1, $2, $3, $4)", [uuidv7(), accountId, type, meta.ip]);
  }
}
