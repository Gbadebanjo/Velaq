import { type Column, type Profile, award, dateRange, monthNumeric, monthWords, str } from "./kit.js";

/** How the parts of each section are arranged. Templates differ in these choices, not in content. */
export interface Arrangement {
  /** Classic: organisation first, role in italics. Modern: role first, organisation in the accent colour. */
  experience: "organisation-first" | "role-first";
  skills: "inline" | "pills" | "list";
  bullet: "dot" | "dash";
  justifyAbout: boolean;
}

export type SectionName = "about" | "skills" | "experience" | "projects" | "education" | "certifications";

export const TITLES: Record<SectionName, string> = {
  about: "Profile",
  skills: "Skills",
  experience: "Professional Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
};

/** Draws the named sections, in order, skipping any with nothing in them. */
export function drawSections(col: Column, p: Profile, names: SectionName[], a: Arrangement) {
  for (const name of names) DRAW[name](col, p, a);
}

const has = (list: unknown[] | undefined) => !!list?.length;

const DRAW: Record<SectionName, (col: Column, p: Profile, a: Arrangement) => void> = {
  about(col, p, a) {
    if (!p.basics.about) return;
    col.heading(TITLES.about);
    col.paragraph(p.basics.about, { justify: a.justifyAbout });
  },

  skills(col, p, a) {
    if (!has(p.skills)) return;
    col.heading(TITLES.skills);
    const skills = p.skills!;
    if (a.skills === "inline") col.paragraph(skills.join("  •  "));
    else if (a.skills === "list") for (const s of skills) col.line(s, { font: col.s.body, size: col.s.bodySize });
    else pills(col, skills);
  },

  experience(col, p, a) {
    if (!has(p.entries.experience)) return;
    col.heading(TITLES.experience);
    for (const e of p.entries.experience!) {
      const d = e.data;
      const dates = dateRange(d.start, d.end, d.current === true, col.s.dateStyle);
      col.room(60);
      if (a.experience === "organisation-first") {
        col.line(str(d.organisation), { right: dates });
        col.line(str(d.role), { font: col.s.sub, size: col.s.bodySize, right: str(d.location) });
      } else {
        col.line(str(d.role), { right: dates });
        col.line([str(d.organisation), str(d.location)].filter(Boolean).join("  ·  "), { font: col.s.sub, size: col.s.bodySize, color: col.s.accent });
      }
      col.bullets(str(d.description), a.bullet);
      col.gap();
    }
  },

  projects(col, p) {
    if (!has(p.entries.portfolio)) return;
    col.heading(TITLES.projects);
    for (const e of p.entries.portfolio!) {
      const d = e.data;
      col.room(40);
      col.line(str(d.title), { link: str(d.url) || undefined, linkIcon: true });
      if (str(d.description)) col.paragraph(str(d.description));
      col.gap();
    }
  },

  education(col, p) {
    if (!has(p.entries.education)) return;
    col.heading(TITLES.education);
    for (const e of p.entries.education!) {
      const d = e.data;
      const what = award(d);
      col.room(44);
      col.line(what || str(d.school), { right: dateRange(d.start, d.end, d.current === true, col.s.dateStyle) });
      if (what) col.line(str(d.school), { font: col.s.sub, size: col.s.bodySize });
      if (str(d.description)) col.paragraph(str(d.description));
      col.gap();
    }
  },

  certifications(col, p) {
    if (!has(p.entries.certification)) return;
    col.heading(TITLES.certifications);
    for (const e of p.entries.certification!) {
      const d = e.data;
      col.room(40);
      const issued = col.s.dateStyle === "numeric" ? monthNumeric(d.issued) : monthWords(d.issued);
      col.line(str(d.name), { right: issued, link: str(d.url) || undefined, linkIcon: true });
      const sub = [str(d.issuer), str(d.credentialId) && `Credential ${str(d.credentialId)}`, monthWords(d.expires) && `Expires ${monthWords(d.expires)}`].filter(Boolean).join(" · ");
      if (sub) col.line(sub, { font: col.s.sub, size: col.s.bodySize });
      col.gap();
    }
  },
};

/** Skills as soft rounded tags that wrap across lines. */
function pills(col: Column, skills: string[]) {
  const { doc, s } = col;
  const size = s.bodySize - 0.5;
  const padX = 7;
  const h = size + 8;
  doc.font(s.body).fontSize(size);
  let x = col.left;
  let y = doc.y + 2;
  for (const skill of skills) {
    const w = doc.widthOfString(skill) + padX * 2;
    if (x + w > col.right && x > col.left) {
      x = col.left;
      y += h + 5;
    }
    if (y + h > col.bottom) {
      col.room(h + 10);
      y = doc.y;
      x = col.left;
    }
    doc.roundedRect(x, y, w, h, h / 2).fill(tint(s.accent));
    doc.fillColor(s.ink).text(skill, x + padX, y + 4, { lineBreak: false, width: w - padX * 2 + 2 });
    x += w + 5;
  }
  doc.x = col.left;
  doc.y = y + h + 4;
}

/** A very light version of a colour, for backgrounds. */
export function tint(hex: string, amount = 0.88): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r! << 16) | (g! << 8) | b!).toString(16).slice(1)}`;
}

