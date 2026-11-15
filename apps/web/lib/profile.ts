/** Shapes of the Professional Profile (PER-001), shared by the server pages and the client forms. */

export type EntryKind = "experience" | "education" | "certification" | "portfolio" | "link";

export interface Basics {
  headline: string;
  location: string;
  about: string;
  phone: string;
  website: string;
  showEmail: boolean;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  data: Record<string, string | boolean>;
}

export interface Profile {
  person: { firstName: string | null; lastName: string | null; email: string };
  basics: Basics;
  skills: string[];
  entries: Record<EntryKind, Entry[]>;
  share: { token: string } | null;
  cvTemplate: CvTemplate;
  completeness: { percent: number; missing: string[] };
  updatedAt: string | null;
}

/** What someone with the share link sees: the whole profile, without settings. */
export interface SharedProfile {
  person: { firstName: string | null; lastName: string | null; email?: string };
  basics: Omit<Basics, "showEmail">;
  skills: string[];
  entries: Record<EntryKind, Entry[]>;
}

/** The whole profile as the editor sends it to be saved. */
export interface ProfileInput {
  basics: Basics;
  skills: string[];
  entries: Record<EntryKind, { id?: string; data: Entry["data"] }[]>;
}

export type CvTemplate = "classic" | "modern" | "sidebar";

/** The CV designs a person can pick. Preview images are made from a made-up sample person. */
export const CV_TEMPLATES: { id: CvTemplate; name: string; about: string }[] = [
  { id: "classic", name: "Classic", about: "Serif type, centred header, ruled headings. Traditional and formal." },
  { id: "modern", name: "Modern", about: "Clean sans-serif with a teal accent and skills as tags." },
  { id: "sidebar", name: "Sidebar", about: "Two columns: contact, skills and education down the side." },
];

/** Where the profile lives in the app. */
export const PROFILE_PATH = "/app/professional-profile";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2024-03" -> "Mar 2024". */
export function monthLabel(m: unknown): string {
  if (typeof m !== "string" || !/^\d{4}-\d{2}$/.test(m)) return "";
  return `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
}

export function dateRange(start: unknown, end: unknown, current = false): string {
  const a = monthLabel(start);
  const b = current ? "Present" : monthLabel(end);
  return a && b ? `${a} – ${b}` : a || b;
}

export const str = (v: unknown) => (typeof v === "string" ? v : "");

/** "https://ada.design/" -> "ada.design". */
export const displayUrl = (u: unknown) => str(u).replace(/^https?:\/\//, "").replace(/\/$/, "");

export const fullName = (p: { firstName: string | null; lastName: string | null }) => [p.firstName, p.lastName].filter(Boolean).join(" ");

// ---------------------------------------------------------------------------------------------
// Tailor for a job

export interface AiStatus {
  available: boolean;
  dailyLimit: number;
  remainingToday: number;
}

export interface TextChange {
  original: string;
  suggested: string;
  /** The AI's text broke a rule (it added something not in the profile), so the original was kept. */
  kept: boolean;
}

export interface Suggestions {
  headline: TextChange;
  about: TextChange;
  skills: { original: string[]; suggested: string[] };
  experience: (TextChange & { id: string; role: string; organisation: string })[];
  projects: { original: string[]; suggested: string[] };
  certifications: { original: string[]; suggested: string[] };
  gaps: string[];
  summary: string;
  model: string;
}

export interface VersionSummary {
  id: string;
  name: string;
  jobTitle: string;
  company: string;
  createdAt: string;
}

export const TAILOR_PATH = `${PROFILE_PATH}/tailor`;
