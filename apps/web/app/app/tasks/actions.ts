"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiUnreachable, api } from "../../../lib/api";
import { sessionToken } from "../../../lib/session";
import { TASKS_PATH } from "../../../lib/tasks";

export interface Result<T = unknown> {
  ok?: T;
  message?: string;
  fields?: Record<string, string>;
}
type ApiError = { message?: string; fields?: Record<string, string> };

/** Sends one request to the tasks API and refreshes the Tasks page. */
export async function taskCall<T = unknown>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Result<T>> {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${TASKS_PATH}`);
  // Only the signed-in person's own task endpoints, and only plain paths.
  if (!/^\/v1\/tasks(\/[a-z0-9-]+)*$/.test(path)) return { message: "That isn't allowed." };
  try {
    const r = await api<T & ApiError>(method, path, { token, body });
    if (r.status === 401) redirect(`/sign-in?next=${TASKS_PATH}`);
    if (r.status >= 400) return { message: r.body.fields ? "Check the highlighted fields." : r.body.message ?? "That didn't work. Try again.", fields: r.body.fields };
    revalidatePath(TASKS_PATH, "layout");
    return { ok: r.body };
  } catch (e) {
    if (e instanceof ApiUnreachable) return { message: "Velaq can't be reached right now. Try again in a moment." };
    throw e;
  }
}
