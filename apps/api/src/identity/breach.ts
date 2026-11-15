import { createHash } from "node:crypto";

export const BREACH_CHECKER = Symbol("BREACH_CHECKER");

export interface BreachChecker {
  /** True when the password appears in known data breaches. */
  isBreached(password: string): Promise<boolean>;
}

/**
 * Have I Been Pwned range lookup. Only the first 5 characters of the password's SHA-1 leave the
 * server (k-anonymity); the password itself is never sent. If the service is unreachable the
 * check is skipped rather than blocking sign-up.
 */
export class HibpBreachChecker implements BreachChecker {
  async isBreached(password: string): Promise<boolean> {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "add-padding": "true" },
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) return false;
      const body = await res.text();
      return body.split("\n").some((line) => {
        const [hash, count] = line.trim().split(":");
        return hash === suffix && Number(count) > 0;
      });
    } catch {
      return false;
    }
  }
}

export class NoBreachChecker implements BreachChecker {
  async isBreached(): Promise<boolean> {
    return false;
  }
}

export function breachCheckerFromEnv(env: NodeJS.ProcessEnv = process.env): BreachChecker {
  return env.PASSWORD_BREACH_CHECK === "off" ? new NoBreachChecker() : new HibpBreachChecker();
}
