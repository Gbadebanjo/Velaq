/**
 * Building blocks shared by every CV template: fonts, dates, icons, contact details, and a
 * Column that lays out headings, entries and bullet points within a strip of the page.
 */
import { fileURLToPath } from "node:url";
import type { SharedProfile } from "../profile.service.js";

export type Doc = PDFKit.PDFDocument;
export type Profile = SharedProfile;
type Data = Record<string, unknown>;

const font = (file: string) => fileURLToPath(new URL(`../../../assets/fonts/${file}`, import.meta.url));

/** Lora (serif) and Montserrat (sans). Both print Yoruba and other accented names. */
export function registerFonts(doc: Doc) {
  doc.registerFont("serif", font("Lora-Regular.ttf"));
  doc.registerFont("serif-italic", font("Lora-Italic.ttf"));
  doc.registerFont("serif-bold", font("Lora-Bold.ttf"));
  doc.registerFont("sans", font("Montserrat-Regular.ttf"));
  doc.registerFont("sans-semibold", font("Montserrat-SemiBold.ttf"));
  doc.registerFont("sans-bold", font("Montserrat-Bold.ttf"));
}

// ---- Text helpers -------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const str = (v: unknown) => (typeof v === "string" ? v : "");

/** "2024-03" -> "03/2024". */
export function monthNumeric(m: unknown): string {
  if (typeof m !== "string" || !/^\d{4}-\d{2}$/.test(m)) return "";
  return `${m.slice(5)}/${m.slice(0, 4)}`;
}
/** "2024-03" -> "Mar 2024". */
export function monthWords(m: unknown): string {
  if (typeof m !== "string" || !/^\d{4}-\d{2}$/.test(m)) return "";
  return `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
}
export function dateRange(start: unknown, end: unknown, current: boolean, style: "numeric" | "words"): string {
  const f = style === "numeric" ? monthNumeric : monthWords;
  const a = f(start);
  const b = current ? (style === "numeric" ? "present" : "Present") : f(end);
  return a && b ? `${a} – ${b}` : a || b;
}

/** Splits a description into bullet points: one per line, without any bullet the person typed. */
export function bullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-–—•*·]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

export const displayUrl = (u: string | undefined) => (u ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

export function fullName(p: Pick<Profile, "person">): string {
  return [p.person.firstName, p.person.lastName].filter(Boolean).join(" ") || "Curriculum vitae";
}

/** "Bachelor of Science in Architecture", or whichever half was given. */
export const award = (d: Data) => [str(d.qualification), str(d.field)].filter(Boolean).join(" in ");

// ---- Icons --------------------------------------------------------------------------------------

// Small line icons (Feather, MIT licence), drawn on a 24-unit grid.
const ICONS = {
  mail: ["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z", "M22 6l-10 7L2 6"],
  phone: ["M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"],
  pin: ["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z", "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"],
  link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  globe: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z", "M2 12h20", "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"],
  linkedin: ["M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z", "M2 9h4v12H2z", "M6 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"],
  github: ["M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"],
} satisfies Record<string, string[]>;
export type IconName = keyof typeof ICONS;

export function drawIcon(doc: Doc, name: IconName, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.translate(x, y).scale(size / 24);
  doc.lineWidth(2).lineCap("round").lineJoin("round").strokeColor(color);
  for (const d of ICONS[name]) doc.path(d).stroke();
  doc.restore();
}

export interface Chip {
  icon: IconName;
  text: string;
  link?: string;
}

/** Email, phone and location, each with its icon. */
export function contactChips(p: Profile): Chip[] {
  const out: Chip[] = [];
  if (p.person.email) out.push({ icon: "mail", text: p.person.email, link: `mailto:${p.person.email}` });
  if (p.basics.phone) out.push({ icon: "phone", text: p.basics.phone, link: `tel:${p.basics.phone.replace(/[^\d+]/g, "")}` });
  if (p.basics.location) out.push({ icon: "pin", text: p.basics.location });
  return out;
}

/** The person's links and website, with an icon picked from the label or address. */
export function linkChips(p: Profile): Chip[] {
  const icon = (label: string, url: string): IconName => {
    const s = `${label} ${url}`.toLowerCase();
    return s.includes("linkedin") ? "linkedin" : s.includes("github") ? "github" : "link";
  };
  return [
    ...(p.entries.link ?? []).map((l) => ({ icon: icon(str(l.data.label), str(l.data.url)), text: str(l.data.label), link: str(l.data.url) })),
    ...(p.basics.website ? [{ icon: "globe" as const, text: displayUrl(p.basics.website), link: p.basics.website }] : []),
  ];
}

/** Lays out icon-and-text items in rows, wrapping when they don't fit. */
export function chipRows(doc: Doc, chips: Chip[], o: { left: number; width: number; align: "center" | "left"; font: string; size: number; ink: string; link: string }) {
  if (!chips.length) return;
  const icon = o.size * 0.95;
  const pad = 3.5;
  const between = 16;
  doc.font(o.font).fontSize(o.size);
  const measured = chips.map((c) => ({ ...c, w: icon + pad + doc.widthOfString(c.text) }));
  const rows: (typeof measured)[] = [[]];
  let used = 0;
  for (const c of measured) {
    const gap = rows.at(-1)!.length ? between : 0;
    if (used + gap + c.w > o.width && rows.at(-1)!.length) {
      rows.push([]);
      used = 0;
    }
    used += (rows.at(-1)!.length ? between : 0) + c.w;
    rows.at(-1)!.push(c);
  }
  for (const row of rows) {
    const total = row.reduce((s, c, i) => s + c.w + (i ? between : 0), 0);
    let x = o.align === "center" ? o.left + (o.width - total) / 2 : o.left;
    const y = doc.y + 2;
    for (const c of row) {
      const isWeb = c.link && !c.link.startsWith("mailto:") && !c.link.startsWith("tel:");
      drawIcon(doc, c.icon, x, y + 0.6, icon, o.ink);
      doc.font(o.font).fontSize(o.size).fillColor(isWeb ? o.link : o.ink);
      doc.text(c.text, x + icon + pad, y, { width: c.w - icon - pad + 1, lineBreak: false, ...(c.link ? { link: c.link } : {}) });
      x += c.w + between;
    }
    doc.x = o.left;
    doc.y = y + o.size * 1.55;
  }
}

/** One item per line, icon then text, wrapping long text such as an email address. For narrow columns. */
export function chipList(doc: Doc, chips: Chip[], o: { left: number; width: number; font: string; size: number; ink: string; link: string }) {
  for (const c of chips) {
    const isWeb = c.link && !c.link.startsWith("mailto:") && !c.link.startsWith("tel:");
    const y = doc.y;
    drawIcon(doc, c.icon, o.left, y + 0.8, o.size, o.ink);
    doc.font(o.font).fontSize(o.size).fillColor(isWeb ? o.link : o.ink);
    doc.text(c.text, o.left + o.size + 6, y, { width: o.width - o.size - 6, ...(c.link ? { link: c.link } : {}) });
    doc.y += 4;
  }
}

// ---- Columns ------------------------------------------------------------------------------------

export interface Style {
  body: string; // font names
  bold: string;
  sub: string;
  ink: string;
  muted: string;
  accent: string;
  link: string;
  bodySize: number;
  titleSize: number;
  dateStyle: "numeric" | "words";
  /** Narrow columns put dates on their own line instead of pinning them right. */
  stackDates?: boolean;
  /** Draws a section heading at the column's current position. */
  heading: (col: Column, title: string) => void;
}

/**
 * A vertical strip of the page (the whole width, or one column of two). It keeps its own place
 * and knows how to continue on the next page, so long sections flow onto page two correctly.
 */
export class Column {
  constructor(
    readonly doc: Doc,
    readonly left: number,
    readonly width: number,
    readonly s: Style,
    /** Moves to where this column continues on the next page, and returns the top y there. */
    private readonly next: () => number,
  ) {}

  get right() {
    return this.left + this.width;
  }

  get bottom() {
    return this.doc.page.height - this.doc.page.margins.bottom;
  }

  /** Moves to the next page first if fewer than `needed` points are left. */
  room(needed: number) {
    if (this.doc.y + needed > this.bottom) this.doc.y = this.next();
  }

  heading(title: string) {
    this.room(90); // keep a heading with the start of its first entry
    this.s.heading(this, title);
  }

  paragraph(text: string, o: { size?: number; justify?: boolean; color?: string } = {}) {
    if (!text) return;
    this.doc.font(this.s.body).fontSize(o.size ?? this.s.bodySize).fillColor(o.color ?? this.s.ink);
    this.doc.text(text, this.left, this.doc.y, { width: this.width, lineGap: 1.5, align: o.justify ? "justify" : "left" });
  }

  /** Text on the left (may wrap) and a short note pinned right on the same line, e.g. dates. */
  line(leftText: string, o: { font?: string; size?: number; color?: string; right?: string; link?: string; linkIcon?: boolean } = {}) {
    const { doc, s } = this;
    const size = o.size ?? s.titleSize;
    if (s.stackDates && o.right) {
      this.line(leftText, { ...o, right: undefined });
      doc.font(s.body).fontSize(s.bodySize - 0.5).fillColor(s.muted).text(o.right, this.left, doc.y, { width: this.width });
      return;
    }
    const top = doc.y;
    doc.font(s.body).fontSize(s.bodySize - 0.5);
    const rightW = o.right ? Math.min(this.width * 0.42, doc.widthOfString(o.right) + 2) : 0;
    if (o.right) doc.fillColor(s.muted).text(o.right, this.right - rightW, top + (size - s.bodySize + 0.5) / 2, { width: rightW, align: "right", lineBreak: false });
    const leftW = this.width - rightW - (rightW ? 12 : 0);
    doc.font(o.font ?? s.bold).fontSize(size).fillColor(o.color ?? s.ink);
    const textW = Math.min(doc.widthOfString(leftText), leftW);
    doc.text(leftText, this.left, top, { width: leftW, ...(o.link ? { link: o.link } : {}) });
    const after = doc.y;
    if (o.linkIcon && o.link && textW < leftW - 14) drawIcon(doc, "link", this.left + textW + 4, top + size * 0.2, size * 0.75, s.link);
    doc.y = Math.max(after, top + size * 1.25);
  }

  bullets(text: string, marker: "dot" | "dash" = "dot") {
    const items = bullets(text);
    if (!items.length) return;
    const { doc, s } = this;
    doc.y += 2;
    for (const item of items) {
      this.room(16);
      const y = doc.y;
      doc.font(s.body).fontSize(s.bodySize).fillColor(s.ink);
      if (marker === "dot") doc.circle(this.left + 6, y + s.bodySize * 0.56, 1.5).fill(s.ink);
      else doc.rect(this.left + 3, y + s.bodySize * 0.52, 5, 1.1).fill(s.accent);
      doc.fillColor(s.ink).text(item, this.left + 14, y, { width: this.width - 14, lineGap: 1 });
    }
  }

  gap(lines = 0.55) {
    this.doc.moveDown(lines);
  }
}
