"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiUnreachable, api } from "../../../lib/api";
import { MONEY_PATH } from "../../../lib/money";
import { sessionToken } from "../../../lib/session";

export interface Result<T = unknown> {
  ok?: T;
  message?: string;
  fields?: Record<string, string>;
}

type ApiError = { message?: string; fields?: Record<string, string> };

/** Sends one request to the money API; refreshes the money pages when something changed. */
export async function moneyCall<T = unknown>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Result<T>> {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${MONEY_PATH}`);
  // Only the signed-in person's own money endpoints, and only plain paths.
  if (!/^\/v1\/money\/[a-z]+(\/[a-z0-9-]+)*$/.test(path)) return { message: "That isn't allowed." };
  try {
    const r = await api<T & ApiError>(method, path, { token, body });
    if (r.status === 401) redirect(`/sign-in?next=${MONEY_PATH}`);
    if (r.status >= 400) return { message: r.body.fields ? "Check the highlighted fields." : r.body.message ?? "That didn't work. Try again.", fields: r.body.fields };
    // Money pages share numbers (entries feed budgets), so refresh them all.
    if (!path.startsWith("/v1/money/import/parse") && !path.startsWith("/v1/money/import/preview")) revalidatePath("/app", "layout");
    return { ok: r.body };
  } catch (e) {
    if (e instanceof ApiUnreachable) return { message: "Velaq can't be reached right now. Try again in a moment." };
    throw e;
  }
}
