import { z } from "zod";

/** Kinds of repeating entry. */
export const ENTRY_KINDS = ["experience", "education", "certification", "portfolio", "link"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Most entries a section may hold, to keep a profile and its PDF a sensible size. */
export const MAX_ENTRIES = 30;
export const MAX_SKILLS = 50;

// ---------------------------------------------------------------------------------------------

/** Free text: trimmed, with control characters other than new lines removed. */
const text = (max: number, what: string) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(max, `Use at most ${max} characters for ${what}.`));

const required = (max: number, what: string) => text(max, what).pipe(z.string().min(1, `Enter ${what}.`));

/** A single line: inner runs of white space collapsed. */
const line = (max: number, what: string) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max, `Use at most ${max} characters for ${what}.`));
const requiredLine = (max: number, what: string) => line(max, what).pipe(z.string().min(1, `Enter ${what}.`));

/** A web address. Only http and https, so a link can never run script. A bare domain gets https:// added. */
const url = (what: string) =>
  line(300, what).transform((s, ctx) => {
    if (!s) return "";
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
    try {
      const u = new URL(withScheme);
      if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".")) return u.toString();
    } catch {
      /* fall through */
    }
    ctx.addIssue({ code: "custom", message: `Enter a web address for ${what}, like example.com.` });
    return z.NEVER;
  });
const requiredUrl = (what: string) => url(what).pipe(z.string().min(1, `Enter ${what}.`));

/** A month as YYYY-MM. Empty means not given. */
const month = (what: string) =>
  z
    .string()
    .trim()
    .refine((s) => s === "" || (/^\d{4}-(0[1-9]|1[0-2])$/.test(s) && Number(s.slice(0, 4)) >= 1940 && Number(s.slice(0, 4)) <= 2100), `Choose a month for ${what}.`);

const endAfterStart = (d: { start?: string; end?: string }) => !d.start || !d.end || d.end >= d.start;

// ---------------------------------------------------------------------------------------------

export const basicsSchema = z.object({
  headline: line(120, "your headline"),
  location: line(120, "your location"),
  about: text(2000, "About me"),
  phone: line(40, "your phone number").refine((s) => s === "" || /^\+?[\d\s()-]{6,}$/.test(s), "Enter a phone number using digits, spaces and + ( ) - only."),
  website: url("your website"),
  showEmail: z.boolean(),
});
export type Basics = z.infer<typeof basicsSchema>;

export const skillsSchema = z.object({
  skills: z
    .array(requiredLine(60, "the skill"))
    .max(MAX_SKILLS, `Add at most ${MAX_SKILLS} skills.`)
    .transform((list) => {
      const seen = new Set<string>();
      return list.filter((s) => !seen.has(s.toLocaleLowerCase()) && seen.add(s.toLocaleLowerCase()));
    }),
});

export const entrySchemas = {
  experience: z
    .object({
      role: requiredLine(120, "the role"),
      organisation: requiredLine(120, "the organisation"),
      location: line(120, "the location"),
      start: month("the start").pipe(z.string().min(1, "Choose the month you started.")),
      end: month("the end"),
      current: z.boolean(),
      description: text(2000, "the description"),
    })
    .transform((d) => (d.current ? { ...d, end: "" } : d))
    .refine((d) => d.current || d.end !== "", { message: "Choose the month you finished, or mark this as your current role.", path: ["end"] })
    .refine(endAfterStart, { message: "The end can't be before the start.", path: ["end"] }),
  education: z
    .object({
      school: requiredLine(120, "the school"),
      qualification: line(120, "the qualification"),
      field: line(120, "the field of study"),
      start: month("the start"),
      end: month("the end"),
      // Still studying there: the CV shows "present" and any end month is dropped.
      current: z.boolean().default(false),
      description: text(1000, "the description"),
    })
    .transform((d) => (d.current ? { ...d, end: "" } : d))
    .refine(endAfterStart, { message: "The end can't be before the start.", path: ["end"] }),
  certification: z
    .object({
      name: requiredLine(120, "the certification"),
      issuer: line(120, "the issuer"),
      issued: month("when it was issued"),
      expires: month("when it expires"),
      credentialId: line(120, "the credential ID"),
      url: url("the credential link"),
    })
    .refine((d) => !d.issued || !d.expires || d.expires >= d.issued, { message: "It can't expire before it was issued.", path: ["expires"] }),
  portfolio: z.object({
    title: requiredLine(120, "a title"),
    url: requiredUrl("the link"),
    description: text(500, "the description"),
  }),
  link: z.object({
    label: requiredLine(60, "a label, like LinkedIn"),
    url: requiredUrl("the link"),
  }),
} satisfies Record<EntryKind, z.ZodTypeAny>;

export type EntryData = { [K in EntryKind]: z.infer<(typeof entrySchemas)[K]> };

export const templateSchema = z.object({ template: z.enum(["classic", "modern", "sidebar"], { message: "Choose Classic, Modern or Sidebar." }) });

/** One entry as sent with the whole profile: its id if it already exists, and its details. */
const entryList = <T extends z.ZodTypeAny>(data: T, noun: string) =>
  z
    .array(z.object({ id: z.string().uuid().optional(), data }))
    .max(MAX_ENTRIES, `Add at most ${MAX_ENTRIES} ${noun}.`);

/**
 * The whole profile, saved in one go. Everything is checked before anything is stored,
 * so a profile is never left half-saved.
 */
export const profileSchema = z.object({
  basics: basicsSchema,
  skills: skillsSchema.shape.skills,
  entries: z.object({
    experience: entryList(entrySchemas.experience, "jobs"),
    education: entryList(entrySchemas.education, "places of study"),
    certification: entryList(entrySchemas.certification, "certifications"),
    portfolio: entryList(entrySchemas.portfolio, "projects"),
    link: entryList(entrySchemas.link, "links"),
  }),
});
export type ProfileInput = z.infer<typeof profileSchema>;
