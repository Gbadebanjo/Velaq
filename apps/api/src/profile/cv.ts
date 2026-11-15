import PDFDocument from "pdfkit";
import { fullName, registerFonts } from "./cv/kit.js";
import { CV_TEMPLATES, type CvTemplate, DRAW_TEMPLATE, MARGINS } from "./cv/templates.js";
import type { SharedProfile } from "./profile.service.js";

export { CV_TEMPLATES, type CvTemplate, fullName };

export const isCvTemplate = (t: unknown): t is CvTemplate => typeof t === "string" && (CV_TEMPLATES as readonly string[]).includes(t);

/**
 * Renders a profile as an A4 CV in the chosen template. The same function serves the owner's
 * download (every section) and a share-link visitor's download (only what was shared), so the
 * two never differ in layout.
 */
export function renderCv(p: SharedProfile, template: CvTemplate = "classic"): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: MARGINS[template],
    bufferPages: true,
    info: { Title: `${fullName(p)} — CV`, Author: fullName(p), Creator: "Velaq" },
  });
  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  DRAW_TEMPLATE[template](doc, p);
  doc.flushPages();
  doc.end();
  return done;
}

/** A file name such as "Ada-Okafor-CV.pdf", limited to safe characters. */
export function cvFileName(p: Pick<SharedProfile, "person">): string {
  const base = fullName(p).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "Profile"}-CV.pdf`;
}
