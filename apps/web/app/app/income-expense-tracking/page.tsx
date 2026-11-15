import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "../../../lib/api";
import { type BudgetMonth, type GoalList, MONEY_PATH, type MoneySetup, type Summary, type Transaction, money, monthName, shiftMonth, thisMonth } from "../../../lib/money";
import { sessionToken } from "../../../lib/session";
import { MoneyBoard } from "./MoneyBoard";

export const metadata: Metadata = { title: "Income & Expense · Velaq" };
export const dynamic = "force-dynamic";

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const q = await searchParams;
  const month = q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) ? q.month : thisMonth();
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${MONEY_PATH}`);
  const [s, sum, list, bud, gl] = await Promise.all([
    api<MoneySetup>("GET", "/v1/money/setup", { token }),
    api<Summary>("GET", `/v1/money/summary?month=${month}`, { token }),
    api<Transaction[]>("GET", `/v1/money/transactions?month=${month}`, { token }),
    // Budgets may be switched off for this person; the page works without them.
    api<BudgetMonth>("GET", `/v1/money/budgets?month=${month}`, { token }).catch(() => null),
    api<GoalList>("GET", "/v1/money/goals", { token }).catch(() => null),
  ]).catch(() => [null, null, null, null, null] as const);
  if (s?.status === 401) redirect(`/sign-in?next=${MONEY_PATH}`);
  if (!s || !sum || !list || s.status !== 200 || sum.status !== 200 || list.status !== 200) {
    return (
      <div className="page">
        <h1 className="page-title">Income & Expense</h1>
        <p className="form-error" role="alert">This page couldn't be loaded. Refresh in a moment.</p>
      </div>
    );
  }
  const setup = s.body;
  const summary = sum.body;
  const home = setup.homeCurrency;
  const isNow = month === thisMonth();
  const net = Number(summary.net);

  return (
    <div className="page money-page">
      <header className="money-head">
        <div>
          <h1 className="page-title">Income & Expense</h1>
          <nav className="month-nav" aria-label="Month">
            <Link href={`${MONEY_PATH}?month=${shiftMonth(month, -1)}`} aria-label={`Previous month, ${monthName(shiftMonth(month, -1))}`}>‹</Link>
            <span aria-live="polite">{monthName(month)}</span>
            {isNow ? <span className="month-nav-off" aria-hidden="true">›</span> : <Link href={`${MONEY_PATH}?month=${shiftMonth(month, 1)}`} aria-label={`Next month, ${monthName(shiftMonth(month, 1))}`}>›</Link>}
          </nav>
        </div>
        <div className="money-head-links">
          <Link className="btn ghost" href={`${MONEY_PATH}/import`}>Import statement</Link>
          <Link className="btn ghost" href={`${MONEY_PATH}/settings`}>Accounts & categories</Link>
        </div>
      </header>

      <section className="money-totals" aria-label={`Totals for ${monthName(month)}`}>
        <div className="money-total in"><p>Money in</p><strong>{money(summary.income, home)}</strong></div>
        <div className="money-total out"><p>Money out</p><strong>{money(summary.spending, home)}</strong></div>
        <div className={`money-total net ${net < 0 ? "neg" : ""}`}>
          <p>{net < 0 ? "You spent more than came in" : "Left over"}</p>
          <strong>{money(summary.net, home)}</strong>
        </div>
      </section>

      <MoneyBoard setup={setup} summary={summary} transactions={list.body} month={month} budgets={bud?.status === 200 ? bud.body : null} goals={gl?.status === 200 ? gl.body.goals : null} />
    </div>
  );
}
