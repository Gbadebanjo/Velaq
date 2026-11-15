"use client";

import { useId, useState, useTransition } from "react";
import { ACCOUNT_KINDS, CURRENCIES, type Account, type Category, type MoneySetup, money } from "../../../../lib/money";
import { moneyCall } from "../actions";

export function MoneySettings({ setup }: { setup: MoneySetup }) {
  return (
    <>
      <HomeCurrency setup={setup} />
      <Accounts setup={setup} />
      <Categories title="Spending categories" direction="out" list={setup.categories.filter((c) => c.direction === "out")} />
      <Categories title="Income categories" direction="in" list={setup.categories.filter((c) => c.direction === "in")} />
    </>
  );
}

function HomeCurrency({ setup }: { setup: MoneySetup }) {
  const id = useId();
  const [value, setValue] = useState(setup.homeCurrency);
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  return (
    <section className="panel" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Home currency</h2>
      <p className="muted small">Totals and reports are shown in this currency. Money in other currencies is converted at the rate you enter with each entry.</p>
      <div className="inline-form">
        <div className="field">
          <label htmlFor={`${id}-c`} className="sr-only">Home currency</label>
          <select id={`${id}-c`} value={value} disabled={setup.homeCurrencyLocked || busy} onChange={(e) => setValue(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {!setup.homeCurrencyLocked && value !== setup.homeCurrency ? (
          <button type="button" className="btn primary sm" disabled={busy} onClick={() => start(async () => {
            const r = await moneyCall("PUT", "/v1/money/settings", { homeCurrency: value });
            setNote(r.ok ? "Saved." : r.message ?? "That didn't save.");
          })}>Save</button>
        ) : null}
      </div>
      {setup.homeCurrencyLocked ? <p className="field-hint">It can't be changed once you've recorded entries, so your past totals stay right.</p> : null}
      {note ? <p className="small" role="status">{note}</p> : null}
    </section>
  );
}

function Accounts({ setup }: { setup: MoneySetup }) {
  const id = useId();
  const [f, setF] = useState({ name: "", kind: "bank", currency: setup.homeCurrency, openingBalance: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  const active = setup.accounts.filter((a) => !a.archived);
  const archived = setup.accounts.filter((a) => a.archived);

  const add = () =>
    start(async () => {
      setMessage("");
      const r = await moneyCall("POST", "/v1/money/accounts", { ...f, openingBalance: f.openingBalance || "0" });
      if (r.ok) {
        setF({ name: "", kind: "bank", currency: setup.homeCurrency, openingBalance: "" });
        setErrors({});
        return;
      }
      setErrors(r.fields ?? {});
      setMessage(r.fields ? "" : r.message ?? "");
    });

  return (
    <section className="panel" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Accounts</h2>
      <p className="muted small">Where your money sits: each bank, wallet and the cash in your pocket.</p>
      <ul className="manage-list">
        {active.map((a) => <AccountRow key={a.id} account={a} canArchive={active.length > 1} />)}
      </ul>
      {archived.length ? (
        <details className="archived">
          <summary>Archived ({archived.length})</summary>
          <ul className="manage-list">{archived.map((a) => <AccountRow key={a.id} account={a} canArchive />)}</ul>
        </details>
      ) : null}
      <form className="add-box" noValidate onSubmit={(e) => { e.preventDefault(); add(); }}>
        <h3>Add an account</h3>
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`${id}-n`}>Name</label>
            <input id={`${id}-n`} value={f.name} maxLength={60} placeholder="e.g. GTBank, OPay" onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={errors.name ? true : undefined} />
            {errors.name ? <p className="field-error">{errors.name}</p> : null}
          </div>
          <div className="field">
            <label htmlFor={`${id}-k`}>Kind</label>
            <select id={`${id}-k`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {ACCOUNT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`${id}-cur`}>Currency</label>
            <select id={`${id}-cur`} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-ob`}>Balance today (optional)</label>
            <input id={`${id}-ob`} inputMode="decimal" value={f.openingBalance} placeholder="0.00" onChange={(e) => setF({ ...f, openingBalance: e.target.value })} aria-invalid={errors.openingBalance ? true : undefined} />
            {errors.openingBalance ? <p className="field-error">{errors.openingBalance}</p> : null}
          </div>
        </div>
        {message ? <p className="form-error" role="alert">{message}</p> : null}
        <div><button type="submit" className="btn primary sm" disabled={busy}>{busy ? "Adding…" : "Add account"}</button></div>
      </form>
    </section>
  );
}

function AccountRow({ account, canArchive }: { account: Account; canArchive: boolean }) {
  const kind = ACCOUNT_KINDS.find((k) => k.id === account.kind)?.name.split(" (")[0];
  return (
    <Row
      name={account.name}
      meta={`${kind} · ${account.currency}${Number(account.openingBalance) ? ` · started with ${money(account.openingBalance, account.currency)}` : ""}`}
      archived={account.archived}
      canArchive={canArchive}
      path={`/v1/money/accounts/${account.id}`}
      what="account"
    />
  );
}

function Categories({ title, direction, list }: { title: string; direction: "in" | "out"; list: Category[] }) {
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const active = list.filter((c) => !c.archived);
  const archived = list.filter((c) => c.archived);
  const add = () =>
    start(async () => {
      const r = await moneyCall("POST", "/v1/money/categories", { name, direction });
      if (r.ok) {
        setName("");
        setError("");
      } else setError(r.fields?.name ?? r.message ?? "That didn't save.");
    });
  return (
    <section className="panel" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      <ul className="manage-list compact">
        {active.map((c) => <Row key={c.id} name={c.name} archived={false} canArchive={active.length > 1} path={`/v1/money/categories/${c.id}`} what="category" />)}
      </ul>
      {archived.length ? (
        <details className="archived">
          <summary>Archived ({archived.length})</summary>
          <ul className="manage-list compact">{archived.map((c) => <Row key={c.id} name={c.name} archived canArchive path={`/v1/money/categories/${c.id}`} what="category" />)}</ul>
        </details>
      ) : null}
      <form className="inline-form" noValidate onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="field">
          <label htmlFor={`${id}-n`} className="sr-only">New category name</label>
          <input id={`${id}-n`} value={name} maxLength={40} placeholder={direction === "out" ? "e.g. Hair & beauty" : "e.g. Side hustle"} onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} />
        </div>
        <button type="submit" className="btn ghost sm" disabled={busy || !name.trim()}>Add</button>
      </form>
      {error ? <p className="field-error">{error}</p> : null}
    </section>
  );
}

/** One account or category: rename in place, archive or bring back. Past entries keep it either way. */
function Row({ name, meta, archived, canArchive, path, what }: { name: string; meta?: string; archived: boolean; canArchive: boolean; path: string; what: string }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const send = (body: object, after?: () => void) =>
    start(async () => {
      const r = await moneyCall("PATCH", path, body);
      if (r.ok) {
        setError("");
        after?.();
      } else setError(r.fields?.name ?? r.message ?? "That didn't save.");
    });
  return (
    <li className={archived ? "is-archived" : ""}>
      {editing ? (
        <form className="inline-form" noValidate onSubmit={(e) => { e.preventDefault(); send({ name: value }, () => setEditing(false)); }}>
          <div className="field">
            <label htmlFor={`${id}-r`} className="sr-only">New name for {name}</label>
            <input id={`${id}-r`} value={value} autoFocus maxLength={60} onChange={(e) => setValue(e.target.value)} aria-invalid={error ? true : undefined} />
          </div>
          <button type="submit" className="btn primary sm" disabled={busy}>Save</button>
          <button type="button" className="btn ghost sm" onClick={() => { setEditing(false); setValue(name); setError(""); }}>Cancel</button>
        </form>
      ) : (
        <>
          <span className="ml-main"><span className="ml-name">{name}</span>{meta ? <span className="ml-meta">{meta}</span> : null}</span>
          <span className="ml-actions">
            {!archived ? <button type="button" className="text-btn" onClick={() => setEditing(true)} aria-label={`Rename ${name}`}>Rename</button> : null}
            {archived ? (
              <button type="button" className="text-btn" disabled={busy} onClick={() => send({ archived: false })}>Bring back</button>
            ) : canArchive ? (
              <button type="button" className="text-btn" disabled={busy} onClick={() => send({ archived: true })} aria-label={`Archive ${name}`} title={`Hide this ${what}. Past entries keep it.`}>Archive</button>
            ) : null}
          </span>
        </>
      )}
      {error ? <p className="field-error">{error}</p> : null}
    </li>
  );
}
