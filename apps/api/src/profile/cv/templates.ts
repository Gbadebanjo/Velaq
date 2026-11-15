import { Column, type Doc, type Profile, type Style, chipList, chipRows, contactChips, fullName, linkChips } from "./kit.js";
import { drawSections, tint } from "./sections.js";

export const CV_TEMPLATES = ["classic", "modern", "sidebar"] as const;
export type CvTemplate = (typeof CV_TEMPLATES)[number];

/** Page margins each template asks for. */
export const MARGINS: Record<CvTemplate, { top: number; bottom: number; left: number; right: number }> = {
  classic: { top: 42, bottom: 44, left: 48, right: 48 },
  modern: { top: 46, bottom: 46, left: 52, right: 52 },
  sidebar: { top: 44, bottom: 44, left: 0, right: 40 },
};

// ---------------------------------------------------------------------------------------------
// Classic: serif, centred header, capitalised headings over a full rule. Organisation first.

export function classic(doc: Doc, p: Profile) {
  const ink = "#111111";
  const s: Style = {
    body: "serif",
    bold: "serif-bold",
    sub: "serif-italic",
    ink,
    muted: ink,
    accent: ink,
    link: "#1a4fd6",
    bodySize: 10,
    titleSize: 10.5,
    dateStyle: "numeric",
    heading(col, title) {
      col.doc.moveDown(0.9);
      col.doc.font("serif-bold").fontSize(11.5).fillColor(ink).text(title.toUpperCase(), col.left, col.doc.y, { width: col.width, characterSpacing: 0.6 });
      const y = col.doc.y + 1.5;
      col.doc.moveTo(col.left, y).lineTo(col.right, y).lineWidth(1.1).strokeColor(ink).stroke();
      col.doc.y = y + 6;
    },
  };
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const col = new Column(doc, left, width, s, () => (doc.addPage(), doc.page.margins.top));

  doc.font("serif-bold").fontSize(20).fillColor(ink).text(fullName(p), left, doc.y, { width, align: "center" });
  if (p.basics.headline) doc.font("serif-italic").fontSize(12.5).text(p.basics.headline, { width, align: "center" });
  doc.moveDown(0.35);
  const chips = { left, width, align: "center" as const, font: "serif", size: 9.5, ink, link: s.link };
  chipRows(doc, contactChips(p), chips);
  chipRows(doc, linkChips(p), chips);

  drawSections(col, p, ["about", "skills", "experience", "projects", "education", "certifications"], {
    experience: "organisation-first",
    skills: "inline",
    bullet: "dot",
    justifyAbout: true,
  });
}

// ---------------------------------------------------------------------------------------------
// Modern: sans, left-aligned header with an accent bar, accent headings with a trailing rule,
// role first, skills as tags.

export function modern(doc: Doc, p: Profile) {
  const ink = "#1b2430";
  const muted = "#5b6676";
  const accent = "#0e7490";
  const s: Style = {
    body: "sans",
    bold: "sans-semibold",
    sub: "sans-semibold",
    ink,
    muted,
    accent,
    link: accent,
    bodySize: 9.3,
    titleSize: 10.5,
    dateStyle: "words",
    heading(col, title) {
      const { doc } = col;
      doc.moveDown(1);
      const y = doc.y;
      doc.font("sans-bold").fontSize(9.5).fillColor(accent).text(title.toUpperCase(), col.left, y, { characterSpacing: 1.4, lineBreak: false });
      const end = col.left + doc.widthOfString(title.toUpperCase(), { characterSpacing: 1.4 }) + 10;
      doc.moveTo(end, y + 5.5).lineTo(col.right, y + 5.5).lineWidth(0.6).strokeColor(tint(accent, 0.6)).stroke();
      doc.x = col.left;
      doc.y = y + 18;
    },
  };
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const col = new Column(doc, left, width, s, () => (doc.addPage(), doc.page.margins.top));

  doc.rect(0, 0, doc.page.width, 6).fill(accent);
  doc.font("sans-bold").fontSize(24).fillColor(ink).text(fullName(p), left, doc.y, { width, characterSpacing: -0.3 });
  if (p.basics.headline) doc.font("sans-semibold").fontSize(12).fillColor(accent).text(p.basics.headline, { width });
  doc.moveDown(0.4);
  const chips = { left, width, align: "left" as const, font: "sans", size: 8.8, ink: muted, link: accent };
  chipRows(doc, contactChips(p), chips);
  chipRows(doc, linkChips(p), chips);

  drawSections(col, p, ["about", "experience", "projects", "skills", "education", "certifications"], {
    experience: "role-first",
    skills: "pills",
    bullet: "dash",
    justifyAbout: false,
  });
}

// ---------------------------------------------------------------------------------------------
// Sidebar: a tinted left column for contact, skills, education and certifications; the main
// column holds the name, profile, experience and projects. Each column flows onto later pages.

export function sidebar(doc: Doc, p: Profile) {
  const ink = "#1d2733";
  const muted = "#566273";
  const accent = "#2f5d8a";
  const sideW = 188;
  const sidePad = 22;
  const mainLeft = sideW + 28;
  const mainW = doc.page.width - mainLeft - doc.page.margins.right;
  const top = doc.page.margins.top;

  const paintSide = () => doc.save().rect(0, 0, sideW, doc.page.height).fill(tint(accent, 0.9)).restore();
  paintSide();
  doc.on("pageAdded", paintSide);

  const heading = (size: number) => (col: Column, title: string) => {
    col.doc.moveDown(0.9);
    col.doc.font("sans-bold").fontSize(size).fillColor(accent).text(title.toUpperCase(), col.left, col.doc.y, { width: col.width, characterSpacing: 1.2 });
    const y = col.doc.y + 2;
    col.doc.moveTo(col.left, y).lineTo(col.right, y).lineWidth(0.8).strokeColor(tint(accent, 0.45)).stroke();
    col.doc.y = y + 7;
  };
  const base = { body: "sans", bold: "sans-semibold", sub: "sans", ink, muted, accent, link: accent, dateStyle: "words" as const };

  /** Moves a column to the page after the one it is on: an existing page if there is one, else a new one. */
  const nextPage = () => {
    const pages = (doc as unknown as { _pageBuffer: PDFKit.PDFPage[] })._pageBuffer;
    const next = pages.indexOf(doc.page) + 1;
    if (next < doc.bufferedPageRange().count) doc.switchToPage(next);
    else doc.addPage();
    return top;
  };

  // Main column first: it is usually the longer one.
  const main = new Column(doc, mainLeft, mainW, { ...base, bodySize: 9.3, titleSize: 10.5, heading: heading(10) }, nextPage);
  doc.y = top;
  doc.font("sans-bold").fontSize(23).fillColor(ink).text(fullName(p), mainLeft, doc.y, { width: mainW, characterSpacing: -0.3 });
  if (p.basics.headline) doc.font("sans-semibold").fontSize(12).fillColor(accent).text(p.basics.headline, { width: mainW });
  drawSections(main, p, ["about", "experience", "projects"], { experience: "role-first", skills: "list", bullet: "dash", justifyAbout: false });

  // Then the side column, from the top of page one.
  doc.switchToPage(0);
  const side = new Column(doc, sidePad, sideW - sidePad * 2, { ...base, bodySize: 8.6, titleSize: 9.2, stackDates: true, heading: heading(9) }, nextPage);
  doc.y = top - 4;
  const contact = [...contactChips(p), ...linkChips(p)];
  if (contact.length) {
    side.heading("Contact");
    chipList(doc, contact, { left: side.left, width: side.width, font: "sans", size: 8.4, ink, link: accent });
  }
  drawSections(side, p, ["skills", "education", "certifications"], { experience: "role-first", skills: "list", bullet: "dot", justifyAbout: false });
}

export const DRAW_TEMPLATE: Record<CvTemplate, (doc: Doc, p: Profile) => void> = { classic, modern, sidebar };
