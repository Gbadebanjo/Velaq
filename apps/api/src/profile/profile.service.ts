import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { type Queryable, type TxRunner, withSpace } from "@velaq/db";
import { uuidv7 } from "../identity/uuid.js";
import type { CvTemplate } from "./cv.js";
import { PERSONAL_DB } from "../space/space.service.js";
import { type Basics, ENTRY_KINDS, type EntryKind, type ProfileInput } from "./profile.schemas.js";

export interface Entry {
  id: string;
  kind: EntryKind;
  data: Record<string, unknown>;
}

export interface PersonName {
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/** The whole profile as its owner sees it. */
export interface Profile {
  person: PersonName;
  basics: Basics;
  skills: string[];
  entries: Record<EntryKind, Entry[]>;
  share: { token: string } | null;
  cvTemplate: CvTemplate;
  completeness: { percent: number; missing: string[] };
  updatedAt: string | null;
}

/** What a share-link visitor sees: the whole profile as one unit, without settings. Email only if the person chose to show it. */
export interface SharedProfile {
  person: { firstName: string | null; lastName: string | null; email?: string };
  basics: Omit<Basics, "showEmail">;
  skills: string[];
  entries: Record<EntryKind, Entry[]>;
}

export class ProfileError extends Error {
  constructor(
    readonly status: 409,
    message: string,
  ) {
    super(message);
  }
}

const EMPTY_BASICS: Basics = { headline: "", location: "", about: "", phone: "", website: "", showEmail: false };

interface ProfileRow {
  headline: string;
  location: string;
  about: string;
  phone: string;
  website: string;
  show_email: boolean;
  skills: string[];
  cv_template: CvTemplate;
  updated_at: string | Date;
}

/**
 * PER-001 Professional Profile. Every query runs inside the owner's space, so row level security
 * keeps one person's profile from another. A share-link visitor is resolved to a space by the
 * token first, then read through the same space-bound path, and filtered to what was shared.
 */
@Injectable()
export class ProfileService {
  constructor(@Inject(PERSONAL_DB) private readonly db: TxRunner) {}

  async get(spaceId: string, person: PersonName): Promise<Profile> {
    return withSpace(this.db, spaceId, (tx) => this.read(tx, person));
  }

  /**
   * Saves the whole profile at once: details, skills and every entry, in the order given.
   * Entries left out are removed; entries sent without a known id are added. It all happens in
   * one transaction, so a failure leaves the previous profile untouched.
   * If `seen` (the updatedAt the editor loaded) no longer matches, someone saved in between:
   * nothing is written, so a second window can't silently overwrite the first.
   */
  async save(spaceId: string, actorId: string, input: ProfileInput, seen: string | null | undefined): Promise<void> {
    await withSpace(this.db, spaceId, async (tx) => {
      const current = (await tx.query<{ updated_at: string | Date }>("SELECT updated_at FROM profiles FOR UPDATE")).rows[0];
      const currentStamp = current ? new Date(current.updated_at).toISOString() : null;
      if (seen !== undefined && seen !== currentStamp) {
        throw new ProfileError(409, "Your profile was changed in another window. Reload to see the latest version, then make your changes again.");
      }

      const b = input.basics;
      await tx.query(
        `INSERT INTO profiles (headline, location, about, phone, website, show_email, skills) VALUES ($1, $2, $3, $4, $5, $6, $7::text[])
         ON CONFLICT (space_id) DO UPDATE SET headline = $1, location = $2, about = $3, phone = $4, website = $5, show_email = $6, skills = $7::text[], updated_at = clock_timestamp()`,
        [b.headline, b.location, b.about, b.phone, b.website, b.showEmail, input.skills],
      );

      const existing = new Set((await tx.query<{ id: string }>("SELECT id FROM profile_entries")).rows.map((r) => r.id));
      const keep: string[] = [];
      for (const kind of ENTRY_KINDS) {
        let position = 0;
        for (const e of input.entries[kind]) {
          // Only ids already in this space are reused; anything else becomes a new entry.
          const id = e.id && existing.has(e.id) && !keep.includes(e.id) ? e.id : uuidv7();
          keep.push(id);
          await tx.query(
            `INSERT INTO profile_entries (id, section, position, data) VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT (id) DO UPDATE SET section = $2, position = $3, data = $4::jsonb, updated_at = now()`,
            [id, kind, position++, JSON.stringify(e.data)],
          );
        }
      }
      await tx.query("DELETE FROM profile_entries WHERE NOT (id = ANY($1::uuid[]))", [keep]);
      await audit(tx, actorId, "update", "profile", spaceId);
    });
  }

  async setCvTemplate(spaceId: string, actorId: string, template: CvTemplate): Promise<void> {
    await withSpace(this.db, spaceId, async (tx) => {
      await tx.query(
        "INSERT INTO profiles (cv_template) VALUES ($1) ON CONFLICT (space_id) DO UPDATE SET cv_template = $1",
        [template],
      );
      await audit(tx, actorId, "update", "profile_cv_template", spaceId);
    });
  }

  /** Creates the share link, or replaces it so the old link stops working. */
  async newShareLink(spaceId: string, actorId: string): Promise<string> {
    const token = randomBytes(18).toString("base64url");
    await withSpace(this.db, spaceId, async (tx) => {
      await tx.query(
        "INSERT INTO profile_share_links (token) VALUES ($1) ON CONFLICT (space_id) DO UPDATE SET token = $1, created_at = now()",
        [token],
      );
      await audit(tx, actorId, "create", "profile_share_link", spaceId);
    });
    return token;
  }

  async removeShareLink(spaceId: string, actorId: string): Promise<void> {
    await withSpace(this.db, spaceId, async (tx) => {
      await tx.query("DELETE FROM profile_share_links");
      await audit(tx, actorId, "delete", "profile_share_link", spaceId);
    });
  }

  /** The space a share link opens, or null when the link is wrong or turned off. */
  async spaceForToken(token: string): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.share_token', $1, true)", [token]);
      const r = await tx.query<{ space_id: string }>("SELECT space_id FROM profile_share_links WHERE token = $1", [token]);
      return r.rows[0]?.space_id ?? null;
    });
  }

  // -------------------------------------------------------------------------------------------

  private async read(tx: Queryable, person: PersonName): Promise<Profile> {
    const p = (await tx.query<ProfileRow>("SELECT headline, location, about, phone, website, show_email, skills, cv_template, updated_at FROM profiles")).rows[0];
    const rows = (await tx.query<{ id: string; section: EntryKind; data: Record<string, unknown> }>(
      "SELECT id, section, data FROM profile_entries ORDER BY section, position, created_at",
    )).rows;
    const share = (await tx.query<{ token: string }>("SELECT token FROM profile_share_links")).rows[0];

    const entries = Object.fromEntries(ENTRY_KINDS.map((k) => [k, [] as Entry[]])) as Record<EntryKind, Entry[]>;
    for (const r of rows) entries[r.section].push({ id: r.id, kind: r.section, data: r.data });
    const basics: Basics = p
      ? { headline: p.headline, location: p.location, about: p.about, phone: p.phone, website: p.website, showEmail: p.show_email }
      : EMPTY_BASICS;
    const skills = p?.skills ?? [];

    return {
      person,
      basics,
      skills,
      entries,
      share: share ? { token: share.token } : null,
      cvTemplate: p?.cv_template ?? "classic",
      completeness: completeness(basics, skills, entries),
      updatedAt: p ? new Date(p.updated_at).toISOString() : null,
    };
  }
}

/** The profile as a share-link visitor sees it: everything, minus settings, and the email only if chosen. */
export function toShared(full: Profile): SharedProfile {
  const { showEmail, ...basics } = full.basics;
  return {
    person: { firstName: full.person.firstName, lastName: full.person.lastName, ...(showEmail ? { email: full.person.email } : {}) },
    basics,
    skills: full.skills,
    entries: full.entries,
  };
}

/** How complete the profile is, and what to add next. */
export function completeness(basics: Basics, skills: string[], entries: Record<EntryKind, Entry[]>) {
  const checks: [boolean, string][] = [
    [basics.headline !== "", "a headline"],
    [basics.about !== "", "an About me"],
    [basics.location !== "", "your location"],
    [basics.phone !== "" || basics.website !== "" || basics.showEmail || entries.link.length > 0, "a way to contact you"],
    [entries.experience.length > 0, "your experience"],
    [entries.education.length > 0, "your education"],
    [skills.length >= 3, "at least three skills"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([ok]) => !ok).map(([, what]) => what) };
}

async function audit(tx: Queryable, actorId: string, action: string, entity: string, entityId: string) {
  await tx.query("INSERT INTO audit_log (id, actor_id, action, entity, entity_id) VALUES ($1, $2, $3, $4, $5)", [uuidv7(), actorId, action, entity, entityId]);
}
