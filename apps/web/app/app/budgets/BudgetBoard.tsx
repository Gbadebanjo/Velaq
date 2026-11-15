"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type Budget, type BudgetMonth, MONEY_PATH, money, monthName } from "../../../lib/money";
import { moneyCall } from "../income-expense-tracking/actions";

type Editing = { budget: Budget | null } | null;

export function BudgetBoard({ data, editable, isNow }: { data: BudgetMonth; editable: boolean; isNow: boolean }) {
  const [editing, setEditing] = useState<Editing>(null);
  const opener = useRef<HTMLElement | null>(null);
  const home = data.homeCurrency;
  const full = data.plan.enforced && data.plan.limit !== null && data.plan.used >= data.plan.limit;
  // After a budget is stopped, its button disappears once the page refreshes; keep focus in the list.
  useEffect(() => {
    if (!editing && opener.current && !opener.current.isConnected) {
      document.getElementById("budget-list")?.focus();
      opener.current = null;
    }
  }, [data, editing]);
  const open = (budget: Budget | null, from: HTMLElement) => {
    opener.current = from;
    setEditing({ budget });
  };

  return (
    <>
      <section className="panel" aria-labelledby="budget-list">
        <div className="panel-head">
          <div>
            <h2 id="budget-list" tabIndex={-1}>Your budgets</h2>
            {!editable ? <p className="muted small">Past months show what you had then. They can't be changed.</p> : null}
          </div>
          {editable && data.unbudgeted.length && !full ? (
            <button type="button" className="btn primary sm" onClick={(e) => open(null, e.currentTarget)}>+ Add a budget</button>
          ) : null}
        </div>

        {data.items.length ? (
          <ul className="budget-list">
            {data.items.map((b) => (
              <li key={b.categoryId} className={`budget ${b.state}`}>
                <div className="budget-head">
                  <span className="budget-name">{b.name}</span>
                  <span className="budget-nums"><strong>{money(b.spent, home, { whole: true })}</strong> of {money(b.available, home, { whole: true })}</span>
                </div>
                <div className="budget-bar" role="progressbar" aria-label={`${b.name}: ${b.percent}% used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, b.percent)}>
                  <span style={{ width: `${Math.min(100, b.percent)}%` }} />
                </div>
                <div className="budget-foot">
                  <span className="budget-status">
                    {b.state === "over"
                      ? `${money(-Number(b.left), home, { whole: true })} over`
                      : `${money(b.left, home, { whole: true })} left${isNow && b.perDay && Number(b.perDay) > 0 ? ` · about ${money(b.perDay, home, { whole: true })} a day` : ""}`}
                    {b.state === "near" ? <em className="budget-flag">{b.percent}% used</em> : null}
                  </span>
                  <span className="budget-extra">
                    {Number(b.carried) > 0 ? <span className="muted small">Includes {money(b.carried, home, { whole: true })} carried over</span> : null}
                    {b.rollover && !Number(b.carried) ? <span className="muted small">Carry-over on</span> : null}
                    {editable ? <button type="button" className="text-btn" onClick={(e) => open(b, e.currentTarget)} aria-label={`Change the ${b.name} budget`}>Change</button> : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p>{editable ? `No budgets for ${monthName(data.month)} yet.` : `There were no budgets in ${monthName(data.month)}.`}</p>
            {editable ? <p className="muted small">Pick a category you'd like to keep an eye on, like Food or Transport, and set a monthly limit. Velaq warns you at 80% and when you go over.</p> : null}
          </div>
        )}
        {full ? <p className="field-hint">The Free plan includes budgets on {data.plan.limit} categories. Stop one to add another.</p> : null}
      </section>

      {editable && data.unbudgeted.some((c) => Number(c.spent) > 0) ? (
        <section className="panel" aria-labelledby="no-budget">
          <h2 id="no-budget">Spending without a budget</h2>
          <ul className="acct-list">
            {data.unbudgeted.filter((c) => Number(c.spent) > 0).sort((a, b) => Number(b.spent) - Number(a.spent)).map((c) => (
              <li key={c.categoryId}><span className="acct-name">{c.name}</span><span className="acct-bal">{money(c.spent, home)}</span></li>
            ))}
          </ul>
          <p className="muted small">From <Link href={`${MONEY_PATH}?month=${data.month}`}>Income & Expense</Link>.</p>
        </section>
      ) : null}

      {editing ? (
        <BudgetDialog
          data={data}
          budget={editing.budget}
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

function BudgetDialog({ data, budget, onClose }: { data: BudgetMonth; budget: Budget | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? "");
  const [amount, setAmount] = useState(budget ? String(Number(budget.limit)) : "");
  const [rollover, setRollover] = useState(budget?.rollover ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, start] = useTransition();
  const spentSoFar = data.unbudgeted.find((c) => c.categoryId === categoryId)?.spent;

  useEffect(() => {
    dialog.current?.showModal();
    document.documentElement.classList.add("modal-open");
    return () => document.documentElement.classList.remove("modal-open");
  }, []);

  const save = () =>
    start(async () => {
      setMessage("");
      if (!categoryId) return setErrors({ categoryId: "Choose a category." });
      const r = await moneyCall("PUT", `/v1/money/budgets/${categoryId}`, { amount, rollover, month: data.month });
      if (r.ok) return onClose();
      setErrors(r.fields ?? {});
      setMessage(r.fields ? "" : r.message ?? "");
    });
  const stop = () =>
    start(async () => {
      const r = await moneyCall("DELETE", `/v1/money/budgets/${budget!.categoryId}`, { month: data.month });
      if (r.ok) return onClose();
      setMessage(r.message ?? "That didn't work. Try again.");
    });

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
      <form className="cv-modal-box entry-box" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <header className="cv-modal-head">
          <h2 id={`${id}-title`}>{budget ? `${budget.name} budget` : "Add a budget"}</h2>
          <button type="button" className="icon-btn cv-modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="entry-body">
          {!budget ? (
            <div className="field">
              <label htmlFor={`${id}-cat`}>Category</label>
              <select id={`${id}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={errors.categoryId ? true : undefined}>
                <option value="">Choose…</option>
                {data.unbudgeted.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
              </select>
              {spentSoFar && Number(spentSoFar) > 0 ? <p className="field-hint">You've spent {money(spentSoFar, data.homeCurrency)} on this in {monthName(data.month)} so far.</p> : null}
              {errors.categoryId ? <p className="field-error">{errors.categoryId}</p> : null}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor={`${id}-amt`}>Monthly limit ({data.homeCurrency})</label>
            <p className="field-hint">It stays the same every month until you change it.</p>
            <input id={`${id}-amt`} className="amount-input" inputMode="decimal" value={amount} placeholder="0" autoFocus={!!budget} onChange={(e) => setAmount(e.target.value)} aria-invalid={errors.amount ? true : undefined} />
            {errors.amount ? <p className="field-error">{errors.amount}</p> : null}
          </div>
          <label className="switch-row">
            <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />
            <span>
              <strong>Carry over what's left</strong>
              <span className="muted small">Money you don't spend is added to next month's limit. Overspending isn't carried.</span>
            </span>
          </label>
          {message ? <p className="form-error" role="alert">{message}</p> : null}
        </div>
        <footer className="cv-modal-foot entry-foot">
          {budget ? (
            confirmStop ? (
              <span className="entry-actions confirm"><span>Stop this budget?</span>
                <button type="button" className="btn danger sm" onClick={stop} disabled={busy}>Stop</button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirmStop(false)}>Keep</button>
              </span>
            ) : <button type="button" className="text-btn danger" onClick={() => setConfirmStop(true)}>Stop this budget</button>
          ) : <span />}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : budget ? "Save changes" : "Add budget"}</button>
        </footer>
      </form>
    </dialog>
  );
}
