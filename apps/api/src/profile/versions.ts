/**
 * Tailored versions: a copy of the CV adapted to one job, as approved by the person. Each is a
 * full snapshot, so later edits to the main profile never change a version already sent, and
 * saving a version never touches the main profile.
 */
import { Inject, Injectable } from "@nestjs/common";
import { type TxRunner, withSpace } from "@velaq/db";
import { z } from "zod";
import { uuidv7 } from "../identity/uuid.js";
import { PERSONAL_DB } from "../space/space.service.js";
import { type Entry, type PersonName, ProfileError, ProfileService, type SharedProfile, toShared } from "./profile.service.js";
import { tailorRequestSchema } from "./tailor.js";

export const MAX_VERSIONS = 50;

const clean = (max: number, what: string) =>
  z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max, `Use at most ${max} characters for ${what}.`));

/** What the review screen sends: the job, and the changes the person accepted (and perhaps edited). */
export const saveVersionSchema = tailorRequestSchema.extend({
  name: z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().min(1, "Give this version a name.").max(120, "Use at most 120 characters for the name.")),
  jobDescription: z.string().transform((s) => s.trim()).pipe(z.string().max(12000)).default(""),
  changes: z.object({
    headline: clean(120, "the headline").transform((s) => s.replace(/\s+/g, " ")),
    about: clean(2000, "About me"),
    skills: z.array(z.string()).max(50),
    experience: z.array(z.object({ id: z.string().uuid(), description: clean(2000, "the description") })).max(30),
    projects: z.array(z.string().uuid()).max(30),
    certifications: z.array(z.string().uuid()).max(30),
  }),
});
export type SaveVersion = z.infer<typeof saveVersionSchema>;

export interface VersionSummary {
  id: string;
  name: string;
  jobTitle: string;
  company: string;
  createdAt: string;
}
export interface Version extends VersionSummary {
  jobDescription: string;
  content: SharedProfile;
}

/** Puts entries in the given order of ids; ids not in the list keep their place after them. */
function reorder(list: Entry[], ids: string[]): Entry[] {
  const byId = new Map(list.map((e) => [e.id, e]));
  const out: Entry[] = [];
  for (const id of ids) {
    const e = byId.get(id);
    if (e && !out.includes(e)) out.push(e);
  }
  return [...out, ...list.filter((e) => !out.includes(e))];
}

/**
 * Builds the version from the main profile as it is now, applying only what tailoring may
 * change: headline, About me, which of the person's own skills to show and in what order, job
 * descriptions, and the order of jobs, projects and certifications. Everything else is copied.
 */
export function buildVersion(main: SharedProfile, c: SaveVersion["changes"]): SharedProfile {
  const own = new Map(main.skills.map((s) => [s.toLocaleLowerCase(), s]));
  const skills: string[] = [];
  for (const s of c.skills) {
    const real = own.get(s.trim().toLocaleLowerCase());
    if (real && !skills.includes(real)) skills.push(real);
  }
  const descriptions = new Map(c.experience.map((x) => [x.id, x.description]));
  return {
    ...main,
    basics: { ...main.basics, headline: c.headline, about: c.about },
    skills,
    entries: {
      ...main.entries,
      experience: reorder(main.entries.experience, c.experience.map((x) => x.id)).map((e) =>
        descriptions.has(e.id) ? { ...e, data: { ...e.data, description: descriptions.get(e.id)! } } : e,
      ),
      portfolio: reorder(main.entries.portfolio, c.projects),
      certification: reorder(main.entries.certification, c.certifications),
    },
  };
}

interface Row {
  id: string;
  name: string;
  job_title: string;
  company: string;
  job_description?: string;
  content?: SharedProfile;
  created_at: string | Date;
}

const summary = (r: Row): VersionSummary => ({ id: r.id, name: r.name, jobTitle: r.job_title, company: r.company, createdAt: new Date(r.created_at).toISOString() });

@Injectable()
export class VersionService {
  constructor(
    @Inject(PERSONAL_DB) private readonly db: TxRunner,
    @Inject(ProfileService) private readonly profiles: ProfileService,
  ) {}

  async list(spaceId: string): Promise<VersionSummary[]> {
    const r = await withSpace(this.db, spaceId, (tx) => tx.query<Row>("SELECT id, name, job_title, company, created_at FROM profile_versions ORDER BY created_at DESC"));
    return r.rows.map(summary);
  }

  async get(spaceId: string, id: string): Promise<Version | null> {
    const r = await withSpace(this.db, spaceId, (tx) => tx.query<Row>("SELECT * FROM profile_versions WHERE id = $1", [id]));
    const row = r.rows[0];
    return row ? { ...summary(row), jobDescription: row.job_description ?? "", content: row.content! } : null;
  }

  async save(spaceId: string, actorId: string, person: PersonName, v: SaveVersion): Promise<VersionSummary> {
    const main = toShared(await this.profiles.get(spaceId, person));
    const content = buildVersion(main, v.changes);
    const id = uuidv7();
    return withSpace(this.db, spaceId, async (tx) => {
      const n = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM profile_versions")).rows[0]?.n ?? 0;
      if (n >= MAX_VERSIONS) throw new ProfileError(409, `You can keep up to ${MAX_VERSIONS} tailored versions. Delete one you no longer need first.`);
      const r = await tx.query<Row>(
        `INSERT INTO profile_versions (id, name, job_title, company, job_description, content) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id, name, job_title, company, created_at`,
        [id, v.name, v.jobTitle, v.company, v.jobDescription, JSON.stringify(content)],
      );
      await tx.query("INSERT INTO audit_log (id, actor_id, action, entity, entity_id) VALUES ($1, $2, 'create', 'profile_version', $3)", [uuidv7(), actorId, id]);
      return summary(r.rows[0]!);
    });
  }

  async remove(spaceId: string, actorId: string, id: string): Promise<boolean> {
    return withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query("DELETE FROM profile_versions WHERE id = $1 RETURNING id", [id]);
      if (r.rows.length) await tx.query("INSERT INTO audit_log (id, actor_id, action, entity, entity_id) VALUES ($1, $2, 'delete', 'profile_version', $3)", [uuidv7(), actorId, id]);
      return r.rows.length > 0;
    });
  }

  /** How many times this person asked the AI to tailor in the last 24 hours. */
  async tailoredToday(spaceId: string): Promise<number> {
    const r = await withSpace(this.db, spaceId, (tx) =>
      tx.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_log WHERE action = 'tailor' AND occurred_at > now() - interval '24 hours'"),
    );
    return r.rows[0]?.n ?? 0;
  }

  async recordTailoring(spaceId: string, actorId: string): Promise<void> {
    await withSpace(this.db, spaceId, (tx) =>
      tx.query("INSERT INTO audit_log (id, actor_id, action, entity, entity_id) VALUES ($1, $2, 'tailor', 'profile', $3)", [uuidv7(), actorId, spaceId]),
    );
  }
}
