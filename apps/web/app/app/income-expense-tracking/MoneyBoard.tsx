"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { BUDGETS_PATH, type BudgetAlert, type BudgetMonth, GOALS_PATH, type Goal, MONEY_PATH, type MoneySetup, type Summary, type Transaction, alertText, dayName, money, monthName, today } from "../../../lib/money";
import { moneyCall } from "./actions";

type Kind = Transaction["kind"];

export function MoneyBoard({ setup, summary, transactions, month, budgets, goals }: { setup: MoneySetup; summary: Summary; transactions: Transaction[]; month: string; budgets: BudgetMonth | null; goals: Goal[] | null }) {
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [alert, setAlert] = useState<BudgetAlert | null>(null);
  const watch = budgets?.items.filter((b) => b.state !== "ok") ?? [];
  const opener = useRef<HTMLElement | null>(null);
  const home = setup.homeCurrency;
  const accounts = useMemo(() => new Map(setup.accounts.map((a) => [a.id, a])), [setup.accounts]);
  const categories = useMemo(() => new Map(setup.categories.map((c) => [c.id, c])), [setup.categories]);
  const biggest = Number(summary.spendingByCategory[0]?.amount ?? 0);
  const trendMax = Math.max(1, ...summary.trend.flatMap((t) => [Number(t.income), Number(t.spending)]));
  const byDay = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of transactions) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
    return [...groups.entries()];
  }, [transactions]);

  const open = (t: Transaction | "new", from: HTMLElement) => {
    opener.current = from;
    setEditing(t);
  };

  return (
    <>
      {alert ? (
        <div className={`budget-alert ${alert.state}`} role="status">
          <p>{alertText(alert, home)} <Link href={`${BUDGETS_PATH}?month=${alert.month}`}>See budgets</Link></p>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setAlert(null)}>✕</button>
        </div>
      ) : null}
      {budgets ? (
        <section className="budget-strip" aria-label="Budgets">
          {budgets.items.length ? (
            <>
              <p>
                <strong>Budgets:</strong>{" "}
                {watch.length ? watch.slice(0, 3).map((b) => alertText(b, home)).join(" ") : `all ${budgets.items.length} on track.`}
                {watch.length > 3 ? ` And ${watch.length - 3} more.` : ""}
              </p>
              <Link className="text-btn" href={`${BUDGETS_PATH}?month=${month}`}>Budgets</Link>
            </>
          ) : (
            <>
              <p className="muted">Set a monthly limit for categories like Food or Transport, and Velaq will warn you before you overspend.</p>
              <Link className="text-btn" href={BUDGETS_PATH}>Set a budget</Link>
            </>
          )}
        </section>
      ) : null}
      <div className="money-grid">
        <section className="panel" aria-labelledby="by-cat">
          <h2 id="by-cat">Where it went</h2>
          {summary.spendingByCategory.length ? (
            <ul className="cat-bars">
              {summary.spendingByCategory.map((c) => (
                <li key={c.categoryId}>
                  <div className="cat-bar-head">
                    <span>{categories.get(c.categoryId)?.name ?? "Other"}</span>
                    <span>{money(c.amount, home, { whole: true })}</span>
                  </div>
                  <div className="cat-bar"><span style={{ width: `${Math.max(2, (Number(c.amount) / biggest) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No spending recorded for {monthName(month)}.</p>}
        </section>

        <section className="panel" aria-labelledby="accts">
          <div className="panel-head">
            <h2 id="accts">Accounts</h2>
            <Link className="text-btn" href={`${MONEY_PATH}/settings`}>Manage</Link>
          </div>
          <ul className="acct-list">
            {setup.accounts.filter((a) => !a.archived).map((a) => {
              const bal = summary.balances.find((b) => b.accountId === a.id)?.balance ?? "0";
              return (
                <li key={a.id}>
                  <span className="acct-name">{a.name}</span>
                  <span className={`acct-bal ${Number(bal) < 0 ? "neg" : ""}`}>{money(bal, a.currency)}</span>
                </li>
              );
            })}
          </ul>
          <p className="muted small">Balances at the end of {monthName(month)}, in each account's currency.</p>
        </section>

        <section className="panel trend-panel" aria-labelledby="trend">
          <h2 id="trend">Last six months</h2>
          <div className="trend" role="img" aria-label={summary.trend.map((t) => `${monthName(t.month, "short")}: in ${money(t.income, home, { whole: true })}, out ${money(t.spending, home, { whole: true })}`).join("; ")}>
            {summary.trend.map((t) => (
              <div key={t.month} className={`trend-col ${t.month === month ? "now" : ""}`}>
                <div className="trend-bars">
                  <span className="in" style={{ height: `${(Number(t.income) / trendMax) * 100}%` }} />
                  <span className="out" style={{ height: `${(Number(t.spending) / trendMax) * 100}%` }} />
                </div>
                <span className="trend-label">{monthName(t.month, "short").split(" ")[0]}</span>
              </div>
            ))}
          </div>
          <p className="trend-key"><span className="key in" /> Money in <span className="key out" /> Money out</p>
        </section>
      </div>

      <section className="panel" aria-labelledby="entries">
        <div className="panel-head">
          <h2 id="entries">Entries</h2>
          <button type="button" className="btn primary" onClick={(e) => open("new", e.currentTarget)}>+ Add</button>
        </div>
        {byDay.length ? (
          <div className="txn-days">
            {byDay.map(([day, list]) => (
              <div key={day}>
                <h3 className="txn-day">{dayName(day)}</h3>
                <ul className="txn-list">
                  {list.map((t) => {
                    const account = accounts.get(t.accountId);
                    const label = t.kind === "transfer" ? `${account?.name ?? "?"} → ${accounts.get(t.toAccountId!)?.name ?? "?"}` : categories.get(t.categoryId!)?.name ?? "Other";
                    return (
                      <li key={t.id}>
                        <button type="button" className={`txn ${t.kind}`} onClick={(e) => open(t, e.currentTarget)}>
                          <span className="txn-dot" aria-hidden="true" />
                          <span className="txn-main">
                            <span className="txn-title">{t.note || label}</span>
                            <span className="txn-sub">{t.note ? label : ""}{t.kind !== "transfer" ? `${t.note ? " · " : ""}${account?.name ?? ""}` : ""}{t.source === "csv" ? " · imported" : ""}{t.setAside ? ` · ${money(t.setAside.amount, home, { whole: true })} to ${goals?.find((g) => g.id === t.setAside!.goalId)?.name ?? "a goal"}` : ""}</span>
                          </span>
                          <span className="txn-amt">
                            {t.kind === "transfer" ? money(t.amount, t.currency) : money(t.kind === "income" ? t.amount : -Number(t.amount), t.currency, { sign: true })}
                            {t.currency !== home ? <small>{money(t.baseAmount, home)}</small> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>Nothing recorded for {monthName(month)} yet.</p>
            <p className="muted small">Add what came in and what you spent, or import a bank statement.</p>
          </div>
        )}
      </section>

      {editing ? (
        <EntryDialog
          setup={setup}
          entry={editing === "new" ? null : editing}
          onSaved={setAlert}
          goals={goals}
          onClose={() => {
            setEditing(null);
            const back = opener.current;
            requestAnimationFrame(() => back?.focus());
          }}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function EntryDialog({ setup, entry, onClose, onSaved, goals }: { setup: MoneySetup; entry: Transaction | null; onClose: () => void; onSaved: (a: BudgetAlert | null) => void; goals: Goal[] | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const active = setup.accounts.filter((a) => !a.archived || a.id === entry?.accountId || a.id === entry?.toAccountId);
  const [kind, setKind] = useState<Kind>(entry?.kind ?? "expense");
  const [f, setF] = useState({
    amount: entry?.amount ? String(Number(entry.amount)) : "",
    date: entry?.date ?? today(),
    accountId: entry?.accountId ?? active[0]?.id ?? "",
    toAccountId: entry?.toAccountId ?? active.find((a) => a.id !== (entry?.accountId ?? active[0]?.id))?.id ?? "",
    toAmount: entry?.toAmount ? String(Number(entry.toAmount)) : "",
    categoryId: entry?.categoryId ?? "",
    fxRate: entry && entry.fxRate !== "1" && Number(entry.fxRate) !== 1 ? String(Number(entry.fxRate)) : "",
    note: entry?.note ?? "",
    tags: entry?.tags.join(", ") ?? "",
  });
  const [saGoal, setSaGoal] = useState(entry?.setAside?.goalId ?? "");
  const [saAmount, setSaAmount] = useState(entry?.setAside ? String(Number(entry.setAside.amount)) : "");
  const goalChoices = goals?.filter((g) => !g.archived || g.id === entry?.setAside?.goalId) ?? [];
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    dialog.current?.showModal();
    document.documentElement.classList.add("modal-open");
    return () => document.documentElement.classList.remove("modal-open");
  }, []);

  const from = setup.accounts.find((a) => a.id === f.accountId);
  const to = setup.accounts.find((a) => a.id === f.toAccountId);
  const cats = setup.categories.filter((c) => c.direction === (kind === "income" ? "in" : "out") && (!c.archived || c.id === entry?.categoryId));
  const needsRate = !!from && from.currency !== setup.homeCurrency;
  const needsToAmount = kind === "transfer" && !!from && !!to && from.currency !== to.currency;

  const save = () =>
    start(async () => {
      setMessage("");
      const body = {
        kind,
        date: f.date,
        amount: f.amount,
        accountId: f.accountId,
        categoryId: kind === "transfer" ? null : f.categoryId || null,
        toAccountId: kind === "transfer" ? f.toAccountId : null,
        toAmount: needsToAmount ? f.toAmount : null,
        fxRate: needsRate ? f.fxRate : null,
        note: f.note,
        tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
        // Only sent when Savings Goals is on; otherwise whatever was set aside is left alone.
        ...(goals && kind === "income" ? { setAside: saGoal ? { goalId: saGoal, amount: saAmount } : null } : {}),
      };
      const r = entry ? await moneyCall<{ budgetAlert?: BudgetAlert | null }>("PUT", `/v1/money/transactions/${entry.id}`, body) : await moneyCall<{ budgetAlert?: BudgetAlert | null }>("POST", "/v1/money/transactions", body);
      if (r.ok) {
        onSaved(r.ok.budgetAlert ?? null);
        return onClose();
      }
      setErrors(r.fields ?? {});
      setMessage(r.message ?? "");
    });

  const remove = () =>
    start(async () => {
      const r = await moneyCall("DELETE", `/v1/money/transactions/${entry!.id}`);
      if (r.ok) return onClose();
      setMessage(r.message ?? "It couldn't be deleted. Try again.");
    });

  const field = (k: string, label: string, input: React.ReactNode, hint?: string) => (
    <div className="field">
      <label htmlFor={`${id}-${k}`}>{label}</label>
      {hint ? <p className="field-hint">{hint}</p> : null}
      {input}
      {errors[k] ? <p className="field-error">{errors[k]}</p> : null}
    </div>
  );
  const inv = (k: string) => (errors[k] ? true : undefined);

  return (
    <dialog
      ref={dialog}
      className="cv-modal entry-modal"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="cv-modal-box entry-box"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <header className="cv-modal-head">
          <h2 id={`${id}-title`}>{entry ? "Edit entry" : "Add an entry"}</h2>
          <button type="button" className="icon-btn cv-modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="entry-body">
          <div className="seg" role="radiogroup" aria-label="Kind of entry">
            {(["expense", "income", "transfer"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); set("categoryId", ""); }}>
                {k === "expense" ? "Money out" : k === "income" ? "Money in" : "Move money"}
              </button>
            ))}
          </div>

          <div className="field-pair">
            {field("amount", `Amount${from ? ` (${from.currency})` : ""}`, <input id={`${id}-amount`} inputMode="decimal" className="amount-input" value={f.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={inv("amount")} autoFocus placeholder="0.00" />)}
            {field("date", "Date", <input id={`${id}-date`} type="date" value={f.date} max={today()} onChange={(e) => set("date", e.target.value)} aria-invalid={inv("date")} />)}
          </div>

          <div className="field-pair">
            {field("accountId", kind === "transfer" ? "From" : kind === "income" ? "Into" : "Paid from",
              <select id={`${id}-accountId`} value={f.accountId} onChange={(e) => set("accountId", e.target.value)} aria-invalid={inv("accountId")}>
                {active.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>)}
            {kind === "transfer"
              ? field("toAccountId", "To",
                  <select id={`${id}-toAccountId`} value={f.toAccountId} onChange={(e) => set("toAccountId", e.target.value)} aria-invalid={inv("toAccountId")}>
                    {active.filter((a) => a.id !== f.accountId).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                  </select>)
              : field("categoryId", "Category",
                  <select id={`${id}-categoryId`} value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} aria-invalid={inv("categoryId")}>
                    <option value="">Choose…</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>)}
          </div>

          {needsRate || needsToAmount ? (
            <div className="field-pair">
              {needsRate ? field("fxRate", `Rate: ${setup.homeCurrency} per 1 ${from!.currency}`, <input id={`${id}-fxRate`} inputMode="decimal" value={f.fxRate} onChange={(e) => set("fxRate", e.target.value)} aria-invalid={inv("fxRate")} placeholder="e.g. 1550" />, "The rate you actually got.") : null}
              {needsToAmount ? field("toAmount", `Amount received (${to!.currency})`, <input id={`${id}-toAmount`} inputMode="decimal" value={f.toAmount} onChange={(e) => set("toAmount", e.target.value)} aria-invalid={inv("toAmount")} />) : null}
            </div>
          ) : null}

          {kind === "income" && goalChoices.length ? (
            <fieldset className="set-aside">
              <legend>Set some aside for a goal (optional)</legend>
              <div className="field-pair">
                {field("setAside.goalId", "Goal",
                  <select id={`${id}-setAside.goalId`} value={saGoal} onChange={(e) => setSaGoal(e.target.value)} aria-invalid={inv("setAside.goalId")}>
                    <option value="">None</option>
                    {goalChoices.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>)}
                {saGoal ? field("setAside.amount", `Amount (${setup.homeCurrency})`,
                  <input id={`${id}-setAside.amount`} inputMode="decimal" value={saAmount} placeholder="0" onChange={(e) => setSaAmount(e.target.value)} aria-invalid={inv("setAside.amount")} />) : null}
              </div>
            </fieldset>
          ) : kind === "income" && goals && !goals.length ? (
            <p className="muted small">Saving towards something? <Link href={GOALS_PATH}>Start a savings goal</Link> and you can set money aside here.</p>
          ) : null}

          {field("note", "Note (optional)", <input id={`${id}-note`} value={f.note} maxLength={200} onChange={(e) => set("note", e.target.value)} placeholder={kind === "expense" ? "e.g. Lunch with team" : ""} />)}
          {field("tags", "Tags (optional)", <input id={`${id}-tags`} value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="e.g. work, wedding" />, "Separate tags with commas.")}

          {message ? <p className="form-error" role="alert">{message}</p> : null}
        </div>
        <footer className="cv-modal-foot entry-foot">
          {entry ? (
            confirmDelete ? (
              <span className="entry-actions confirm"><span>Delete this entry?</span>
                <button type="button" className="btn danger sm" onClick={remove} disabled={busy}>Delete</button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : <button type="button" className="text-btn danger" onClick={() => setConfirmDelete(true)}>Delete</button>
          ) : <span />}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : entry ? "Save changes" : "Add entry"}</button>
        </footer>
      </form>
    </dialog>
  );
}
