"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "../../_auth/actions";
import { api } from "../../../lib/api";
import { clearSession, sessionToken } from "../../../lib/session";

/** Ends every session for this account, on every device, then returns to sign-in. */
export async function signOutEverywhere(): Promise<void> {
  const token = await sessionToken();
  if (token) {
    try {
      await api("POST", "/v1/auth/sign-out-everywhere", { token });
    } catch {
      // Still sign out here if the API can't be reached.
    }
  }
  await clearSession();
  redirect("/sign-in?signed_out=1");
}

/** Saves the person's first and last name, then refreshes every signed-in page that shows it. */
export async function updateName(_: FormState, form: FormData): Promise<FormState> {
  const token = await sessionToken();
  if (!token) redirect("/sign-in?next=/app/account");
  const values = { firstName: String(form.get("firstName") ?? ""), lastName: String(form.get("lastName") ?? "") };
  try {
    const r = await api<{ message?: string; fields?: Record<string, string> }>("PATCH", "/v1/auth/name", { token, body: values });
    if (r.status === 401) redirect("/sign-in?next=/app/account");
    if (r.status !== 200) return { fields: r.body.fields, message: r.body.fields ? undefined : "Your name couldn't be saved. Try again.", values };
  } catch {
    return { message: "Velaq can't be reached right now. Try again in a moment.", values };
  }
  revalidatePath("/app", "layout");
  return { notice: "Name saved.", values };
}
