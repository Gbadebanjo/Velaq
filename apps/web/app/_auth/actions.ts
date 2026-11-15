"use server";

import { redirect } from "next/navigation";
import { ApiUnreachable, api } from "../../lib/api";
import { clearSession, sessionToken, setSession } from "../../lib/session";

export interface FormState {
  /** Message about the whole form. */
  message?: string;
  /** Messages for individual fields, keyed by field name. */
  fields?: Record<string, string>;
  /** A confirmation rather than an error, e.g. "We sent a new code." */
  notice?: string;
  /** Values to keep in the form after an error. */
  values?: Record<string, string>;
}

type Session = { token: string; expiresAt: string };
type ApiBody = { error?: string; message?: string | string[]; fields?: Record<string, string>; session?: Session; next?: string };

const field = (f: FormData, name: string) => String(f.get(name) ?? "");

/** Only same-site paths, so a crafted link can't send people elsewhere after signing in. */
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/app";
}

function unreachable(e: unknown): FormState {
  if (e instanceof ApiUnreachable && process.env.NODE_ENV !== "production") {
    return { message: `Can't reach the Velaq API at ${e.message}. Start it with pnpm dev:api.` };
  }
  return { message: "Velaq can't be reached right now. Try again in a moment." };
}

function errorState(body: ApiBody, values: Record<string, string>): FormState {
  const message = Array.isArray(body.message) ? body.message[0] : body.message;
  return { message: body.fields ? undefined : message ?? "Something went wrong. Try again.", fields: body.fields, values };
}

const verifyUrl = (email: string, next?: string) =>
  `/verify-email?email=${encodeURIComponent(email)}${next && next !== "/app" ? `&next=${encodeURIComponent(next)}` : ""}`;

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email");
  const firstName = field(form, "firstName");
  const lastName = field(form, "lastName");
  try {
    const r = await api<ApiBody>("POST", "/v1/auth/sign-up", { body: { firstName, lastName, email, password: field(form, "password") } });
    if (r.status !== 202) return errorState(r.body, { firstName, lastName, email });
  } catch (e) {
    return unreachable(e);
  }
  redirect(verifyUrl(email.trim()));
}

export async function verifyEmail(_: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email");
  const next = safeNext(field(form, "next"));
  try {
    const r = await api<ApiBody>("POST", "/v1/auth/verify-email", { body: { email, code: field(form, "code") } });
    if (r.status !== 200 || !r.body.session) return errorState(r.body, {});
    await setSession(r.body.session);
  } catch (e) {
    return unreachable(e);
  }
  redirect(next);
}

export async function resendCode(_: FormState, form: FormData): Promise<FormState> {
  const purpose = field(form, "purpose") === "reset_password" ? "reset_password" : "verify_email";
  try {
    const r = await api<ApiBody>("POST", "/v1/auth/resend-code", { body: { email: field(form, "email"), purpose } });
    if (r.status !== 202) return errorState(r.body, {});
  } catch (e) {
    return unreachable(e);
  }
  return { notice: "We sent a new code. Only the newest code works." };
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email");
  const next = safeNext(field(form, "next"));
  let goTo: string;
  try {
    const r = await api<ApiBody>("POST", "/v1/auth/sign-in", { body: { email, password: field(form, "password") } });
    if (r.status !== 200) return errorState(r.body, { email });
    if (r.body.session) {
      await setSession(r.body.session);
      goTo = next;
    } else {
      goTo = verifyUrl(email.trim(), next);
    }
  } catch (e) {
    return unreachable(e);
  }
  redirect(goTo);
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email");
  try {
    const r = await api<ApiBody>("POST", "/v1/auth/forgot-password", { body: { email } });
    if (r.status !== 202) return errorState(r.body, { email });
  } catch (e) {
    return unreachable(e);
  }
  redirect(`/reset-password?email=${encodeURIComponent(email.trim())}`);
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email");
  try {
    const r = await api<ApiBody>("POST", "/v1/auth/reset-password", {
      body: { email, code: field(form, "code"), password: field(form, "password") },
    });
    if (r.status !== 200 || !r.body.session) return errorState(r.body, {});
    await setSession(r.body.session);
  } catch (e) {
    return unreachable(e);
  }
  redirect("/app");
}

export async function signOut(): Promise<void> {
  const token = await sessionToken();
  if (token) {
    try {
      await api("POST", "/v1/auth/sign-out", { token });
    } catch {
      // Signing out locally still works if the API can't be reached.
    }
  }
  await clearSession();
  redirect("/sign-in?signed_out=1");
}
