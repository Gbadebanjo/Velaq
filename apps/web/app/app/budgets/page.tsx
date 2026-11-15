import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "../../../lib/api";
import { BUDGETS_PATH, type BudgetMonth, MONEY_PATH, money, monthName, shiftMonth, thisMonth } from "../../../lib/money";
import { sessionToken } from "../../../lib/session";
import { BudgetBoard } from "./BudgetBoard";

export const metadata: Metadata = { title: "Budgets · Velaq" };
export const dynamic = "force-dynamic";

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const q = await searchParams;
  const now = thisMonth();
  const month = q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) && q.month <= shiftMonth(now, 1) ? q.month : now;
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${BUDGETS_PATH}`);
  const r = await api<BudgetMonth>("GET", `/v1/money/budgets?month=${month}`, { token }).catch(() => null);
  if (r?.status === 401) redirect(`/sign-in?next=${BUDGETS_PATH}`);
  if (!r || r.status !== 200) {
    return (
      <div className="page">
        <h1 className="page-title">Budgets</h1>
        <p className="form-error" role="alert">This page couldn't be loaded. Refresh in a moment.</p>
      </div>
    );
  }
  const b = r.body;
  const home = b.homeCurrency;
  const budgeted = Number(b.totals.budgeted);
  const income = Number(b.totals.income);
  const fill = budgeted > 0 ? Math.min(100, (Number(b.totals.spentInBudgets) / budgeted) * 100) : 0;

  return (
    <div className="page money-page">
      <header className="money-head">
        <div>
          <h1 className="page-title">Budgets</h1>
          <nav className="month-nav" aria-label="Month">
            <Link href={`${BUDGETS_PATH}?month=${shiftMonth(month, -1)}`} aria-label={`Previous month, ${monthName(shiftMonth(month, -1))}`}>‹</Link>
            <span aria-live="polite">{monthName(month)}</span>
            {month >= shiftMonth(now, 1) ? <span className="month-nav-off" aria-hidden="true">›</span> : <Link href={`${BUDGETS_PATH}?month=${shiftMonth(month, 1)}`} aria-label={`Next month, ${monthName(shiftMonth(month, 1))}`}>›</Link>}
          </nav>
        </div>
        <div className="money-head-links">
          <Link className="btn ghost" href={MONEY_PATH}>Income & Expense</Link>
        </div>
      </header>

      {b.items.length ? (
        <section className="budget-overview" aria-label={`Budgets for ${monthName(month)}`}>
          <div className="bo-main">
            <p className="bo-label">Spent in budgets</p>
            <p className="bo-figure"><strong>{money(b.totals.spentInBudgets, home, { whole: true })}</strong> <span>of {money(budgeted, home, { whole: true })}</span></p>
            <div className="bo-bar" aria-hidden="true"><span style={{ width: `${fill}%` }} className={fill >= 100 ? "over" : fill >= 80 ? "near" : ""} /></div>
          </div>
          <dl className="bo-facts">
            <div><dt>Money in this month</dt><dd>{money(income, home, { whole: true })}</dd></div>
            <div>
              <dt>Budgeted vs money in</dt>
              <dd className={income > 0 && budgeted > income ? "warn" : ""}>
                {income > 0 ? (budgeted > income ? `${money(budgeted - income, home, { whole: true })} more than came in` : `${Math.round((budgeted / income) * 100)}% of it`) : "No income recorded yet"}
              </dd>
            </div>
            <div><dt>Spent outside budgets</dt><dd>{money(b.totals.outsideBudgets, home, { whole: true })}</dd></div>
          </dl>
        </section>
      ) : null}

      <BudgetBoard data={b} editable={month >= now} isNow={month === now} />
    </div>
  );
}
