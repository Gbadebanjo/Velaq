"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiUnreachable, api } from "../../../../lib/api";
import { PROFILE_PATH, type Suggestions, TAILOR_PATH, type VersionSummary } from "../../../../lib/profile";
import { sessionToken } from "../../../../lib/session";

export interface Result<T> {
  ok?: T;
  message?: string;
  fields?: Record<string, string>;
}

type ApiError = { message?: string; fields?: Record<string, string> };

async function call<T>(method: "POST" | "DELETE", path: string, body?: unknown, back = TAILOR_PATH): Promise<Result<T>> {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${back}`);
  try {
    const r = await api<T & ApiError>(method, path, { token, body });
    if (r.status === 401) redirect(`/sign-in?next=${back}`);
    if (r.status >= 400) return { message: r.body.message ?? "That didn't work. Try again.", fields: r.body.fields };
    return { ok: r.body };
  } catch (e) {
    if (e instanceof ApiUnreachable) return { message: "Velaq can't be reached right now. Try again in a moment." };
    throw e;
  }
}

/** Asks the AI for suggestions for one job. Nothing is saved. */
export async function tailor(job: { jobTitle: string; company: string; jobDescription: string }): Promise<Result<Suggestions>> {
  return call<Suggestions>("POST", "/v1/profile/tailor", job);
}

/** Saves the approved changes as a new tailored version. The main profile is not touched. */
export async function saveVersion(input: unknown): Promise<Result<VersionSummary>> {
  const r = await call<VersionSummary>("POST", "/v1/profile/versions", input);
  if (r.ok) revalidatePath(PROFILE_PATH);
  return r;
}

export async function deleteVersion(id: string): Promise<Result<{ deleted: boolean }>> {
  const r = await call<{ deleted: boolean }>("DELETE", `/v1/profile/versions/${encodeURIComponent(id)}`, undefined, PROFILE_PATH);
  if (r.ok) revalidatePath(PROFILE_PATH);
  return r;
}
