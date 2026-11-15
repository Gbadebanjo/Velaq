/**
 * velaq_identity: sign-in for every product (FND-001).
 * Holds accounts, email codes and sessions only. No product data lives here, and a session is
 * issued for one product, so a Personal session can never read Business data (AR-0).
 */
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    // Stored lower-cased and trimmed; unique per person.
    email: text("email").notNull().unique(),
    // scrypt hash with its own salt and parameters. Never the password itself.
    passwordHash: text("password_hash").notNull(),
    // The person's name, given at sign-up. Nullable only for accounts made before names were asked.
    firstName: text("first_name"),
    lastName: text("last_name"),
    emailVerifiedAt: ts("email_verified_at"),
    status: text("status").notNull().default("active"),
    createdAt: ts("created_at").notNull().defaultNow(),
    passwordChangedAt: ts("password_changed_at").notNull().defaultNow(),
  },
  (t) => [
    check("accounts_status_ck", sql`${t.status} IN ('active','blocked')`),
    check("accounts_first_name_ck", sql`char_length(${t.firstName}) BETWEEN 1 AND 80`),
    check("accounts_last_name_ck", sql`char_length(${t.lastName}) BETWEEN 1 AND 80`),
  ],
);

/** One-time codes sent by email. Only an HMAC of the code is stored. */
export const emailCodes = pgTable(
  "email_codes",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("email_codes_purpose_ck", sql`${t.purpose} IN ('verify_email','reset_password')`),
    index("email_codes_account_idx").on(t.accountId, t.purpose),
  ],
);

/** Server-side sessions. Only a SHA-256 of the session token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    tokenHash: text("token_hash").notNull().unique(),
    product: text("product").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    check("sessions_product_ck", sql`${t.product} IN ('business','personal','marketplace')`),
    index("sessions_account_idx").on(t.accountId),
  ],
);

/** Fixed-window counters for rate limits on sign-in, sign-up and code requests. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/** Append-only security log of sign-in activity (Security Architecture s.15). */
export const authEvents = pgTable(
  "auth_events",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id"),
    type: text("type").notNull(),
    ip: text("ip"),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("auth_events_account_idx").on(t.accountId, t.occurredAt)],
);
