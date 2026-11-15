"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiUnreachable, api } from "../../../lib/api";
import type { CvTemplate, Profile, ProfileInput } from "../../../lib/profile";
import { PROFILE_PATH } from "../../../lib/profile";
import { sessionToken } from "../../../lib/session";

export interface ProfileFormState {
  /** Message about the whole save. */
  message?: string;
  /** Messages for single fields, keyed by place, such as "basics.headline" or "entries.experience.2.end". */
  fields?: Record<string, string>;
  /** Set when the save worked. */
  saved?: number;
  notice?: string;
  /** The profile as stored after a successful save. */
  profile?: Profile;
  /** Someone saved in another window since this one loaded. */
  conflict?: boolean;
}

type ApiReply = Profile & { message?: string; fields?: Record<string, string>; error?: string };

/** Sends one request to the API and refreshes the profile page. */
async function send(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown, notice?: string): Promise<ProfileFormState> {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${PROFILE_PATH}`);
  let r;
  try {
    r = await api<ApiReply>(method, path, { token, body });
  } catch (e) {
    if (e instanceof ApiUnreachable) return { message: "Velaq can't be reached right now. Your changes are still here. Try again in a moment." };
    throw e;
  }
  if (r.status === 401) redirect(`/sign-in?next=${PROFILE_PATH}`);
  if (r.status === 409) return { conflict: true, message: r.body.message };
  if (r.status >= 400) return { fields: r.body.fields, message: r.body.message ?? "That couldn't be saved. Try again." };
  revalidatePath(PROFILE_PATH);
  return { saved: Date.now(), notice, profile: r.body };
}

/** Saves the whole profile in one go. Nothing is stored unless every part is valid. */
export async function saveProfile(input: ProfileInput, updatedAt: string | null): Promise<ProfileFormState> {
  return send("PUT", "/v1/profile", { ...input, updatedAt }, "Profile saved.");
}

/** Chooses the CV design used for every download of the profile. */
export async function setCvTemplate(template: CvTemplate): Promise<ProfileFormState> {
  return send("PUT", "/v1/profile/template", { template });
}

/** Creates the share link, or replaces it (so the old one stops working). */
export async function createShareLink(replacing = false): Promise<ProfileFormState> {
  return send("POST", "/v1/profile/share", undefined, replacing ? "New link ready. The old one no longer works." : "Your link is ready.");
}

export async function removeShareLink(): Promise<ProfileFormState> {
  return send("DELETE", "/v1/profile/share", undefined, "Link turned off.");
}
