"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { MONEY_PATH, type MoneySetup, money } from "../../../../lib/money";
import { moneyCall } from "../actions";

interface Mapping {
  headerRow: number;
  date: number;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "DD-MMM-YYYY";
  description: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
}
interface Parsed { rows: string[][]; totalRows: number; guess: Mapping }
interface Item { row: number; date: string; description: string; amount: string; kind: "income" | "expense"; categoryId: string | null; imported: boolean; maybeDuplicate: boolean }
interface Preview { account: { id: string; name: string; currency: string }; items: Item[]; problems: { row: number; message: string }[] }
interface Line extends Item { pick: boolean }

const DATE_FORMATS: { id: Mapping["dateFormat"]; name: string }[] = [
  { id: "DD/MM/YYYY", name: "Day first (31/01/2026)" },
  { id: "MM/DD/YYYY", name: "Month first (01/31/2026)" },
  { id: "YYYY-MM-DD", name: "Year first (2026-01-31)" },
  { id: "DD-MMM-YYYY", name: "Month as a word (31-Jan-2026)" },
];

export function ImportFlow({ setup }: { setup: MoneySetup }) {
  const id = useId();
  const accounts = setup.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === "bank")?.id ?? accounts[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [split, setSplit] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();

  const step = done ? 4 : preview ? 3 : parsed ? 2 : 1;
  const header = parsed && mapping ? parsed.rows[mapping.headerRow] ?? [] : [];
  const columns = header.map((h, i) => ({ i, name: h || `Column ${i + 1}` }));
  const out = setup.categories.filter((c) => c.direction === "out" && !c.archived);
  const inn = setup.categories.filter((c) => c.direction === "in" && !c.archived);
  const chosen = lines.filter((l) => l.pick && !l.imported);
  const totals = useMemo(() => chosen.reduce((t, l) => ({ ...t, [l.kind]: t[l.kind] + Number(l.amount) }), { income: 0, expense: 0 }), [chosen]);

  const readFile = (file: File | undefined) => {
    setMessage("");
    if (!file) return;
    if (file.size > 1_000_000) return setMessage("That file is too big. Use a statement of at most 1 MB, or download one month at a time.");
    if (!/\.(csv|txt)$/i.test(file.name) && file.type !== "text/csv") return setMessage("Choose a CSV file. If your bank only gives PDF or Excel, open it in Excel or Google Sheets and save it as CSV.");
    const reader = new FileReader();
    reader.onload = () => {
      setFileName(file.name);
      setCsv(String(reader.result ?? ""));
    };
    reader.onerror = () => setMessage("That file couldn't be read. Try downloading it again.");
    reader.readAsText(file);
  };

  const readStatement = () =>
    start(async () => {
      setMessage("");
      const r = await moneyCall<Parsed>("POST", "/v1/money/import/parse", { csv });
      if (!r.ok) return setMessage(r.message ?? "That file couldn't be read.");
      if (r.ok.rows.length < 2) return setMessage("That file has no lines to import.");
      setParsed(r.ok);
      setMapping(r.ok.guess);
      setSplit(r.ok.guess.amount === null);
    });

  const checkLines = () =>
    start(async () => {
      setMessage("");
      const m = { ...mapping!, amount: split ? null : mapping!.amount ?? 0, debit: split ? mapping!.debit : null, credit: split ? mapping!.credit : null };
      const r = await moneyCall<Preview>("POST", "/v1/money/import/preview", { csv, mapping: m, accountId });
      if (!r.ok) return setMessage(r.message ?? "The lines couldn't be read.");
      if (!r.ok.items.length) return setMessage("No lines could be read with these columns. Check the date style and the amount columns.");
      setPreview(r.ok);
      setLines(r.ok.items.map((i) => ({ ...i, pick: !i.imported && !i.maybeDuplicate })));
    });

  const save = () =>
    start(async () => {
      setMessage("");
      const items = chosen.map((l) => ({ date: l.date, description: l.description, amount: l.amount, kind: l.kind, categoryId: l.categoryId }));
      if (items.some((i) => !i.categoryId)) return setMessage("Choose a category for every ticked line.");
      const r = await moneyCall<{ imported: number; skipped: number }>("POST", "/v1/money/import/commit", { accountId, items });
      if (!r.ok) return setMessage(r.message ?? "The lines couldn't be saved. Try again.");
      setDone(r.ok);
    });

  const setLine = (row: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.row === row ? { ...l, ...patch } : l)));
  const setMap = (patch: Partial<Mapping>) => setMapping((m) => ({ ...m!, ...patch }));
  const colSelect = (k: "date" | "description" | "amount" | "debit" | "credit", label: string, optional = false) => (
    <div className="field">
      <label htmlFor={`${id}-${k}`}>{label}</label>
      <select id={`${id}-${k}`} value={mapping![k] ?? ""} onChange={(e) => setMap({ [k]: e.target.value === "" ? null : Number(e.target.value) })}>
        {optional ? <option value="">None</option> : null}
        {columns.map((c) => <option key={c.i} value={c.i}>{c.name}</option>)}
      </select>
    </div>
  );

  return (
    <div className="import">
      <ol className="steps" aria-label="Import steps">
        {["Choose the file", "Match the columns", "Check the lines", "Done"].map((s, i) => (
          <li key={s} className={step === i + 1 ? "now" : step > i + 1 ? "past" : ""} aria-current={step === i + 1 ? "step" : undefined}>{s}</li>
        ))}
      </ol>

      {message ? <p className="form-error" role="alert">{message}</p> : null}

      {step === 1 ? (
        <section className="panel">
          <div className="field">
            <label htmlFor={`${id}-acct`}>Which account is this statement for?</label>
            <select id={`${id}-acct`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
            <p className="field-hint">Not listed? <Link href={`${MONEY_PATH}/settings`}>Add the account</Link> first.</p>
          </div>
          <label className={`drop ${csv ? "has" : ""}`}>
            <input type="file" accept=".csv,text/csv,.txt" onChange={(e) => readFile(e.target.files?.[0])} />
            <span className="drop-title">{fileName || "Choose a CSV file"}</span>
            <span className="muted small">{csv ? "Ready to read. Choose another file to replace it." : "Up to 1 MB. Most banks let you download one from the statement page."}</span>
          </label>
          <div><button type="button" className="btn primary" disabled={!csv || !accountId || busy} onClick={readStatement}>{busy ? "Reading…" : "Read the statement"}</button></div>
        </section>
      ) : null}

      {step === 2 && parsed && mapping ? (
        <section className="panel">
          <h2>Which column is which?</h2>
          <p className="muted small">Velaq made a guess from your file. Change anything that's wrong; the sample below follows your choices.</p>
          <div className="field-pair">
            <div className="field">
              <label htmlFor={`${id}-hdr`}>Column names are on line</label>
              <select id={`${id}-hdr`} value={mapping.headerRow} onChange={(e) => setMap({ headerRow: Number(e.target.value) })}>
                {parsed.rows.slice(0, 15).map((r, i) => <option key={i} value={i}>{i + 1}: {r.filter(Boolean).slice(0, 3).join(", ").slice(0, 50)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-fmt`}>Date style</label>
              <select id={`${id}-fmt`} value={mapping.dateFormat} onChange={(e) => setMap({ dateFormat: e.target.value as Mapping["dateFormat"] })}>
                {DATE_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field-pair">
            {colSelect("date", "Date")}
            {colSelect("description", "Description")}
          </div>
          <div className="seg" role="radiogroup" aria-label="How amounts are shown">
            <button type="button" role="radio" aria-checked={!split} className={!split ? "on" : ""} onClick={() => setSplit(false)}>One amount column</button>
            <button type="button" role="radio" aria-checked={split} className={split ? "on" : ""} onClick={() => setSplit(true)}>Separate money in and out</button>
          </div>
          {split ? (
            <div className="field-pair">
              {colSelect("debit", "Money out (debit)", true)}
              {colSelect("credit", "Money in (credit)", true)}
            </div>
          ) : (
            <>
              {colSelect("amount", "Amount")}
              <p className="field-hint">Amounts with a minus sign, in brackets or marked DR count as money out.</p>
            </>
          )}
          <div className="sample-wrap">
            <table className="sample">
              <caption className="muted small">The first lines under the column names</caption>
              <thead><tr><th>Date</th><th>Description</th><th>{split ? "Out" : "Amount"}</th>{split ? <th>In</th> : null}</tr></thead>
              <tbody>
                {parsed.rows.slice(mapping.headerRow + 1, mapping.headerRow + 5).map((r, i) => (
                  <tr key={i}>
                    <td>{r[mapping.date]}</td>
                    <td>{r[mapping.description]}</td>
                    <td>{split ? (mapping.debit !== null ? r[mapping.debit] : "") : mapping.amount !== null ? r[mapping.amount] : ""}</td>
                    {split ? <td>{mapping.credit !== null ? r[mapping.credit] : ""}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-actions">
            <button type="button" className="btn ghost" onClick={() => { setParsed(null); setMapping(null); }}>Back</button>
            <button type="button" className="btn primary" disabled={busy} onClick={checkLines}>{busy ? "Reading…" : "Check the lines"}</button>
          </div>
        </section>
      ) : null}

      {step === 3 && preview ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Check the lines</h2>
              <p className="muted small">{preview.items.length} lines read for {preview.account.name}. Untick anything you don't want, and fix categories Velaq guessed wrong.</p>
            </div>
            <div className="row-actions">
              <button type="button" className="text-btn" onClick={() => setLines((ls) => ls.map((l) => ({ ...l, pick: !l.imported })))}>Tick all</button>
              <button type="button" className="text-btn" onClick={() => setLines((ls) => ls.map((l) => ({ ...l, pick: false })))}>Untick all</button>
            </div>
          </div>
          {preview.problems.length ? (
            <details className="import-problems">
              <summary>{preview.problems.length} {preview.problems.length === 1 ? "line" : "lines"} couldn't be read and will be left out</summary>
              <ul>{preview.problems.slice(0, 50).map((p) => <li key={p.row}>Line {p.row}: {p.message}</li>)}</ul>
            </details>
          ) : null}
          <ul className="import-lines">
            {lines.map((l) => (
              <li key={l.row} className={`${l.kind} ${l.imported ? "was" : ""} ${l.pick ? "" : "off"}`}>
                <input type="checkbox" id={`${id}-l${l.row}`} checked={l.pick && !l.imported} disabled={l.imported} onChange={(e) => setLine(l.row, { pick: e.target.checked })} />
                <label htmlFor={`${id}-l${l.row}`} className="il-main">
                  <span className="il-desc">{l.description || "No description"}</span>
                  <span className="il-meta">
                    {l.date}
                    {l.imported ? <em className="flag">Already imported</em> : l.maybeDuplicate ? <em className="flag warn">Looks like one you added by hand</em> : null}
                  </span>
                </label>
                <span className="il-amt">{money(l.kind === "income" ? l.amount : -Number(l.amount), preview.account.currency, { sign: true })}</span>
                <select aria-label={`Category for ${l.description || `line ${l.row}`}`} value={l.categoryId ?? ""} disabled={l.imported || !l.pick} onChange={(e) => setLine(l.row, { categoryId: e.target.value })}>
                  <option value="">Choose…</option>
                  {(l.kind === "income" ? inn : out).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="import-foot">
            <p>
              <strong>{chosen.length}</strong> to import
              {chosen.length ? <span className="muted"> · in {money(totals.income, preview.account.currency)} · out {money(totals.expense, preview.account.currency)}</span> : null}
            </p>
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={() => setPreview(null)}>Back</button>
              <button type="button" className="btn primary" disabled={!chosen.length || busy} onClick={save}>{busy ? "Importing…" : `Import ${chosen.length} ${chosen.length === 1 ? "line" : "lines"}`}</button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 4 && done ? (
        <section className="panel done-panel" role="status">
          <h2>{done.imported} {done.imported === 1 ? "line" : "lines"} imported</h2>
          {done.skipped ? <p className="muted">{done.skipped} were already in Velaq and were skipped.</p> : null}
          <div className="row-actions">
            <Link className="btn primary" href={MONEY_PATH}>See Income & Expense</Link>
            <button type="button" className="btn ghost" onClick={() => { setDone(null); setPreview(null); setParsed(null); setCsv(""); setFileName(""); }}>Import another</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
