import "server-only";
import { cookies } from "next/headers";
import { api } from "./api";

export const SESSION_COOKIE = "velaq_session";

export interface CurrentUser {
  accountId: string;
  email: string;
  /** Null only for accounts made before names were asked at sign-up. */
  firstName: string | null;
  lastName: string | null;
  product: string;
  expiresAt: string;
}

/** Store the session token in a cookie page scripts can't read. */
export async function setSession(session: { token: string; expiresAt: string }): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** What to call the person: their first name, or the start of their email for older accounts. */
export function callName(user: Pick<CurrentUser, "firstName" | "email">): string {
  return user.firstName ?? user.email.split("@")[0]!;
}

/** First name and last name together, or null when the account has no name yet. */
export function fullName(user: Pick<CurrentUser, "firstName" | "lastName">): string | null {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
}

/** The signed-in person, checked with the API on every call. Null when signed out or the session ended. */
export async function currentUser(): Promise<CurrentUser | null> {
  const token = await sessionToken();
  if (!token) return null;
  try {
    const r = await api<CurrentUser>("GET", "/v1/me", { token });
    return r.status === 200 ? r.body : null;
  } catch {
    return null;
  }
}
