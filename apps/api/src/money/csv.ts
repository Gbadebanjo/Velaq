/**
 * Reading bank statement CSV files. Nigerian banks export in many shapes: notes above the table,
 * comma or semicolon separators, one signed amount column or separate debit and credit columns,
 * and several date styles. So the file is read as a plain grid, Velaq guesses the layout, and the
 * person confirms it before anything is imported.
 */
import { createHash } from "node:crypto";
import type { Mapping } from "./money.schemas.js";

export const MAX_ROWS = 2000;

/** Parses CSV text (RFC 4180 quoting) into rows of cells, detecting the separator. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLines = src.split(/\r?\n/).slice(0, 20).join("\n");
  const sep = [",", ";", "\t"].map((s) => [s, firstLines.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
      if (rows.length >= MAX_ROWS) break;
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "") && rows.length < MAX_ROWS) rows.push(row);
  return rows;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Reads a date cell in the chosen style, returning YYYY-MM-DD or null. Times after the date are ignored. */
export function readDate(raw: string, format: Mapping["dateFormat"]): string | null {
  const s = raw.trim().split(/[ T]/)[0]!;
  let y: number, m: number, d: number;
  if (format === "YYYY-MM-DD") {
    const x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (!x) return null;
    [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  } else if (format === "DD-MMM-YYYY") {
    const x = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{2,4})$/.exec(s);
    if (!x) return null;
    [d, m, y] = [Number(x[1]), MONTHS.indexOf(x[2]!.toLowerCase()) + 1, Number(x[3])];
  } else {
    const x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
    if (!x) return null;
    [d, m, y] = format === "DD/MM/YYYY" ? [Number(x[1]), Number(x[2]), Number(x[3])] : [Number(x[2]), Number(x[1]), Number(x[3])];
  }
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** Reads an amount cell: "12,500.00", "-3,000", "(3,000.00)", "₦2,500 DR". Returns a signed number string or null. */
export function readAmount(raw: string): { value: string; negative: boolean } | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = /^\(.*\)$/.test(s) || /\bDR\b/i.test(s) || s.startsWith("-");
  s = s.replace(/\b(DR|CR)\b/gi, "").replace(/[₦$£€()\s,]/g, "").replace(/^NGN/i, "").replace(/^-/, "");
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null;
  const n = Number(s);
  if (n === 0) return null;
  if (/\bCR\b/i.test(raw)) negative = false;
  return { value: n.toFixed(2), negative };
}

const HEADER_WORDS = /date|description|narration|details|remarks|amount|debit|credit|withdrawal|deposit|money (in|out)/i;

/** Guesses where the table starts and which columns hold what. The person can change any of it. */
export function guessMapping(rows: string[][]): Mapping {
  const headerRow = Math.max(0, rows.findIndex((r) => r.filter((c) => HEADER_WORDS.test(c)).length >= 2));
  const header = (rows[headerRow] ?? []).map((h) => h.toLowerCase());
  const find = (re: RegExp, not?: RegExp) => header.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const preferred = find(/trans.*date|txn date|posting date|^date$|^date\b/);
  const date = Math.max(0, preferred >= 0 ? preferred : find(/date/));
  // Words people wrote win over reference numbers, which are only a last resort.
  const description = Math.max(0, [/narration|description|details|remarks|particulars|memo/, /reference|ref\b/].map((re) => find(re)).find((i) => i >= 0) ?? 0);
  const debit = find(/debit|withdrawal|money out|paid out/);
  const credit = find(/credit|deposit|money in|paid in|lodgement/);
  const amount = debit >= 0 && credit >= 0 ? -1 : find(/amount/);
  const samples = rows.slice(headerRow + 1, headerRow + 30).map((r) => r[date] ?? "");
  const formats = (["DD/MM/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY", "MM/DD/YYYY"] as const).map((f) => [f, samples.filter((s) => readDate(s, f)).length] as const);
  const dateFormat = formats.sort((a, b) => b[1] - a[1])[0]![0];
  return { headerRow, date, dateFormat, description, amount: amount >= 0 ? amount : null, debit: debit >= 0 && amount < 0 ? debit : null, credit: credit >= 0 && amount < 0 ? credit : null };
}

export interface CsvItem {
  row: number;
  date: string;
  description: string;
  amount: string;
  kind: "income" | "expense";
}

/** Applies the mapping to every row under the header, reporting rows that can't be read. */
export function readRows(rows: string[][], m: Mapping): { items: CsvItem[]; problems: { row: number; message: string }[] } {
  const items: CsvItem[] = [];
  const problems: { row: number; message: string }[] = [];
  rows.slice(m.headerRow + 1).forEach((r, i) => {
    const row = m.headerRow + 2 + i; // 1-based line number as the person sees it in a spreadsheet
    const date = readDate(r[m.date] ?? "", m.dateFormat);
    let amount: ReturnType<typeof readAmount> = null;
    let kind: CsvItem["kind"] = "expense";
    if (m.amount !== null) {
      amount = readAmount(r[m.amount] ?? "");
      kind = amount?.negative ? "expense" : "income";
    } else {
      const out = m.debit !== null ? readAmount(r[m.debit] ?? "") : null;
      const inn = m.credit !== null ? readAmount(r[m.credit] ?? "") : null;
      amount = out ?? inn;
      kind = out ? "expense" : "income";
    }
    if (!date && !amount) return; // a blank, total or note line: skip quietly
    if (!date) return problems.push({ row, message: "The date couldn't be read. Check the date style." });
    if (!amount) return problems.push({ row, message: "No amount on this line." });
    items.push({ row, date, description: (r[m.description] ?? "").replace(/\s+/g, " ").trim().slice(0, 200), amount: amount.value, kind });
  });
  return { items, problems };
}

/** A fingerprint of a statement line, so importing the same statement twice adds nothing. */
export const importHash = (i: { date: string; amount: string; kind: string; description: string }) =>
  createHash("sha256").update([i.date, Number(i.amount).toFixed(2), i.kind, i.description.toLowerCase()].join("|")).digest("hex").slice(0, 32);

/** Suggests a category from words in the description. Names match the default categories. */
const RULES: [RegExp, string][] = [
  [/salary|payroll|wages/i, "Salary"],
  [/airtime|\bdata\b|mtn|glo\b|airtel|9mobile|vtu/i, "Data & airtime"],
  [/uber|bolt|taxify|indrive|\bbrt\b|fuel|petrol|filling station|toll|parking/i, "Transport"],
  [/dstv|gotv|startimes|showmax|netflix|spotify|electricity|ikedc|ekedc|aedc|phed|eedc|ibedc|prepaid|lawma|water/i, "Bills & utilities"],
  [/sms alert|charge|\bfee\b|stamp duty|vat on|maintenance|commission|cot\b/i, "Bank charges"],
  [/chicken republic|kfc|domino|shoprite|spar\b|market|restaurant|food|eatery|grocer|bakery|chowdeck|glovo/i, "Food & groceries"],
  [/rent|landlord|estate|caution fee|agency fee/i, "Rent & housing"],
  [/hospital|pharmacy|clinic|hmo|medical|lab\b/i, "Health"],
  [/school|tuition|exam|course|udemy|coursera|waec|jamb/i, "Education"],
  [/tithe|offering|church|mosque|zakat|donation/i, "Giving & donations"],
  [/refund|reversal/i, "Refunds"],
];
export function guessCategory(description: string, kind: "income" | "expense", categories: { id: string; name: string; direction: string }[]): string | null {
  const dir = kind === "income" ? "in" : "out";
  const pool = categories.filter((c) => c.direction === dir);
  for (const [re, name] of RULES) {
    if (re.test(description)) {
      const hit = pool.find((c) => c.name === name);
      if (hit) return hit.id;
    }
  }
  return pool.find((c) => c.name === (dir === "in" ? "Other income" : "Other"))?.id ?? pool[0]?.id ?? null;
}
