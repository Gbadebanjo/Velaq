"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type Goal, type GoalList, dayName, money, monthName, today } from "../../../lib/money";
import { moneyCall } from "../income-expense-tracking/actions";

type Open = { kind: "goal"; goal: Goal | null } | { kind: "money"; goal: Goal; take: boolean } | null;

export function GoalsBoard({ list }: { list: GoalList }) {
  const [open, setOpen] = useState<Open>(null);
  const opener = useRef<HTMLElement | null>(null);
  const home = list.homeCurrency;
  const active = list.goals.filter((g) => !g.archived);
  const archived = list.goals.filter((g) => g.archived);
  const show = (o: Open, from: HTMLElement) => {
    opener.current = from;
    setOpen(o);
  };

  // A goal that's archived moves out of the grid, taking its button with it; keep focus in the page.
  useEffect(() => {
    if (!open && opener.current && !opener.current.isConnected) {
      document.getElementById("goals-h")?.focus();
      opener.current = null;
    }
  }, [list, open]);

  return (
    <>
      <section aria-labelledby="goals-h" className="goals">
        <div className="panel-head">
          <h2 id="goals-h" tabIndex={-1} className="sr-only">Your goals</h2>
          {active.length ? <button type="button" className="btn primary sm goals-add" onClick={(e) => show({ kind: "goal", goal: null }, e.currentTarget)}>+ New goal</button> : null}
        </div>
        {active.length ? (
          <ul className="goal-grid">
            {active.map((g) => <GoalCard key={g.id} goal={g} home={home} onOpen={show} />)}
          </ul>
        ) : (
          <div className="panel goals-empty">
            <h2>What are you saving for?</h2>
            <p className="muted">Rent, school fees, a new laptop, an emergency fund. Give it a name and an amount, and Velaq shows how much to set aside each month and when you'll get there.</p>
            <p className="muted small">The money stays in your accounts. A goal keeps count of what it's for.</p>
            <button type="button" className="btn primary" onClick={(e) => show({ kind: "goal", goal: null }, e.currentTarget)}>Start a goal</button>
          </div>
        )}
      </section>

      {archived.length ? (
        <details className="panel archived">
          <summary>Archived goals ({archived.length})</summary>
          <ul className="manage-list">
            {archived.map((g) => (
              <li key={g.id} className="is-archived">
                <span className="ml-main"><span className="ml-name">{g.name}</span><span className="ml-meta">{money(g.saved, home, { whole: true })} of {money(g.target, home, { whole: true })}</span></span>
                <ArchiveButton goal={g} archived />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {open?.kind === "goal" ? <GoalDialog goal={open.goal} home={home} onClose={() => close(setOpen, opener)} /> : null}
      {open?.kind === "money" ? <MoneyDialog goal={open.goal} take={open.take} home={home} onClose={() => close(setOpen, opener)} /> : null}
    </>
  );
}

function close(setOpen: (o: Open) => void, opener: React.MutableRefObject<HTMLElement | null>) {
  setOpen(null);
  const back = opener.current;
  requestAnimationFrame(() => back?.isConnected && back.focus());
}

const STATUS: Record<Goal["status"], string> = {
  reached: "Goal reached",
  on_track: "On track",
  behind: "Behind",
  overdue: "Past its date",
  no_date: "No date set",
  not_started: "Not started",
};

function GoalCard({ goal: g, home, onOpen }: { goal: Goal; home: string; onOpen: (o: Open, from: HTMLElement) => void }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const by = g.targetDate ? monthName(g.targetDate.slice(0, 7)) : null;
  return (
    <li className={`goal-card ${g.status}`}>
      <div className="goal-top">
        <svg className="goal-ring" viewBox="0 0 80 80" role="img" aria-label={`${g.percent}% saved`}>
          <circle cx="40" cy="40" r={r} className="ring-bg" />
          <circle cx="40" cy="40" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - g.percent / 100)} style={{ "--c": c } as React.CSSProperties} />
          <text x="40" y="45" textAnchor="middle">{g.percent}%</text>
        </svg>
        <div className="goal-head">
          <h3>{g.name}</h3>
          <p className="goal-amounts"><strong>{money(g.saved, home, { whole: true })}</strong> of {money(g.target, home, { whole: true })}</p>
          <span className={`goal-chip ${g.status}`}>{STATUS[g.status]}{by && g.status !== "reached" ? ` · by ${by}` : ""}</span>
        </div>
      </div>

      <div className="goal-plan">
        {g.status === "reached" ? (
          <p>You've saved the full amount. Archive it when you've used the money, or raise the target to keep going.</p>
        ) : (
          <>
            {g.monthlyNeeded ? <p>Set aside <strong>{money(g.monthlyNeeded, home, { whole: true })} a month</strong> to finish by {by}.</p> : null}
            {g.status === "overdue" ? <p>{money(g.remaining, home, { whole: true })} still to go. Pick a new date to see a monthly amount.</p> : null}
            {g.projectedMonth ? (
              <p className="muted">At your recent pace ({money(g.pace, home, { whole: true })} a month) you'll get there in {monthName(g.projectedMonth)}.</p>
            ) : g.status !== "overdue" ? (
              <p className="muted">{Number(g.saved) > 0 ? "Nothing added in the last three months." : "Add money to get started."}</p>
            ) : null}
            {g.status === "no_date" ? <p className="muted small">Add a date to see if you're on track.</p> : null}
          </>
        )}
      </div>

      <div className="goal-actions">
        <button type="button" className="btn primary sm" onClick={(e) => onOpen({ kind: "money", goal: g, take: false }, e.currentTarget)} aria-label={`Add money to ${g.name}`}>Add money</button>
        {Number(g.saved) > 0 ? <button type="button" className="btn ghost sm" onClick={(e) => onOpen({ kind: "money", goal: g, take: true }, e.currentTarget)} aria-label={`Take money out of ${g.name}`}>Take out</button> : null}
        <button type="button" className="text-btn" onClick={(e) => onOpen({ kind: "goal", goal: g }, e.currentTarget)} aria-label={`Edit ${g.name}`}>Edit</button>
      </div>

      {g.contributions.length ? <History goal={g} home={home} /> : null}
    </li>
  );
}

function History({ goal, home }: { goal: Goal; home: string }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const remove = (id: string) =>
    start(async () => {
      const r = await moneyCall("DELETE", `/v1/money/goals/contributions/${id}`);
      setConfirm(null);
      setMessage(r.ok ? "" : r.message ?? "That couldn't be removed.");
    });
  return (
    <details className="goal-history">
      <summary>History</summary>
      <ul>
        {goal.contributions.map((c) => (
          <li key={c.id}>
            <span className="gh-main">
              <span>{c.note || (c.kind === "deposit" ? "Added" : "Taken out")}</span>
              <span className="muted small">{dayName(c.date)}{c.transactionId ? " · from an income entry" : ""}</span>
            </span>
            <span className={`gh-amt ${c.kind}`}>{c.kind === "deposit" ? "+" : "−"}{money(c.amount, home)}</span>
            {c.transactionId ? null : confirm === c.id ? (
              <span className="entry-actions confirm">
                <button type="button" className="btn danger sm" disabled={busy} onClick={() => remove(c.id)}>Remove</button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirm(null)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="icon-btn gh-remove" aria-label={`Remove ${c.kind === "deposit" ? "the" : "the withdrawal of"} ${money(c.amount, home)} from ${dayName(c.date)}`} onClick={() => setConfirm(c.id)}>✕</button>
            )}
          </li>
        ))}
      </ul>
      {goal.contributions.some((c) => c.transactionId) ? <p className="muted small">Money set aside from an income entry changes with that entry in Income & Expense.</p> : null}
      {message ? <p className="form-error" role="alert">{message}</p> : null}
    </details>
  );
}

function ArchiveButton({ goal, archived }: { goal: Goal; archived: boolean }) {
  const [busy, start] = useTransition();
  return (
    <button type="button" className="text-btn" disabled={busy} onClick={() => start(async () => { await moneyCall("PATCH", `/v1/money/goals/${goal.id}`, { archived: !archived }); })}>
      {archived ? "Bring back" : "Archive"}
    </button>
  );
}

// ---- Dialogs --------------------------------------------------------------------------------------

function Sheet({ title, onClose, onSubmit, children, foot }: { title: string; onClose: () => void; onSubmit: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    dialog.current?.showModal();
    document.documentElement.classList.add("modal-open");
    return () => document.documentElement.classList.remove("modal-open");
  }, []);
  return (
    <dialog ref={dialog} className="cv-modal entry-modal" aria-labelledby={`${id}-t`} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="cv-modal-box entry-box" noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <header className="cv-modal-head">
          <h2 id={`${id}-t`}>{title}</h2>
          <button type="button" className="icon-btn cv-modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="entry-body">{children}</div>
        <footer className="cv-modal-foot entry-foot">{foot}</footer>
      </form>
    </dialog>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? <p className="field-hint">{hint}</p> : null}
      {children}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

function GoalDialog({ goal, home, onClose }: { goal: Goal | null; home: string; onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? String(Number(goal.target)) : "");
  const [date, setDate] = useState(goal?.targetDate ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const save = () =>
    start(async () => {
      setMessage("");
      const body = { name, target, targetDate: date || null };
      const r = goal ? await moneyCall("PATCH", `/v1/money/goals/${goal.id}`, body) : await moneyCall("POST", "/v1/money/goals", body);
      if (r.ok) return onClose();
      setErrors(r.fields ?? {});
      setMessage(r.fields ? "" : r.message ?? "");
    });
  const archive = () =>
    start(async () => {
      const r = await moneyCall("PATCH", `/v1/money/goals/${goal!.id}`, { archived: true });
      if (r.ok) return onClose();
      setMessage(r.message ?? "That didn't work. Try again.");
    });
  return (
    <Sheet
      title={goal ? `Edit ${goal.name}` : "New goal"}
      onClose={onClose}
      onSubmit={save}
      foot={
        <>
          {goal ? <button type="button" className="text-btn" onClick={archive} disabled={busy}>Archive goal</button> : <span />}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : goal ? "Save changes" : "Create goal"}</button>
        </>
      }
    >
      <Field id={`${id}-n`} label="What are you saving for?" error={errors.name}>
        <input id={`${id}-n`} value={name} maxLength={60} autoFocus placeholder="e.g. Rent, New laptop, Emergency fund" onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? true : undefined} />
      </Field>
      <div className="field-pair">
        <Field id={`${id}-a`} label={`Amount (${home})`} error={errors.target}>
          <input id={`${id}-a`} className="amount-input" inputMode="decimal" value={target} placeholder="0" onChange={(e) => setTarget(e.target.value)} aria-invalid={errors.target ? true : undefined} />
        </Field>
        <Field id={`${id}-d`} label="By when? (optional)" error={errors.targetDate}>
          <input id={`${id}-d`} type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} aria-invalid={errors.targetDate ? true : undefined} />
        </Field>
      </div>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
    </Sheet>
  );
}

function MoneyDialog({ goal, take, home, onClose }: { goal: Goal; take: boolean; home: string; onClose: () => void }) {
  const id = useId();
  const [amount, setAmount] = useState(!take && goal.monthlyNeeded ? String(Number(goal.monthlyNeeded)) : "");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const save = () =>
    start(async () => {
      setMessage("");
      const r = await moneyCall("POST", `/v1/money/goals/${goal.id}/contributions`, { kind: take ? "withdrawal" : "deposit", amount, date, note });
      if (r.ok) return onClose();
      setErrors(r.fields ?? {});
      setMessage(r.fields ? "" : r.message ?? "");
    });
  return (
    <Sheet
      title={take ? `Take money out of ${goal.name}` : `Add money to ${goal.name}`}
      onClose={onClose}
      onSubmit={save}
      foot={<><span /><button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : take ? "Take out" : "Add money"}</button></>}
    >
      <p className="muted small">
        {take ? `${goal.name} holds ${money(goal.saved, home)}.` : `${money(goal.saved, home, { whole: true })} of ${money(goal.target, home, { whole: true })} so far.`} This only changes what the goal counts; your account balances stay as they are.
      </p>
      <div className="field-pair">
        <Field id={`${id}-a`} label={`Amount (${home})`} error={errors.amount}>
          <input id={`${id}-a`} className="amount-input" inputMode="decimal" value={amount} autoFocus placeholder="0" onChange={(e) => setAmount(e.target.value)} aria-invalid={errors.amount ? true : undefined} />
        </Field>
        <Field id={`${id}-d`} label="Date" error={errors.date}>
          <input id={`${id}-d`} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-invalid={errors.date ? true : undefined} />
        </Field>
      </div>
      <Field id={`${id}-note`} label="Note (optional)">
        <input id={`${id}-note`} value={note} maxLength={200} placeholder={take ? "e.g. Paid the deposit" : "e.g. From my side gig"} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
    </Sheet>
  );
}
