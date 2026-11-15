import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "../../../lib/api";
import { GOALS_PATH, type GoalList, MONEY_PATH, money } from "../../../lib/money";
import { sessionToken } from "../../../lib/session";
import { GoalsBoard } from "./GoalsBoard";

export const metadata: Metadata = { title: "Savings Goals · Velaq" };
export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${GOALS_PATH}`);
  const r = await api<GoalList>("GET", "/v1/money/goals", { token }).catch(() => null);
  if (r?.status === 401) redirect(`/sign-in?next=${GOALS_PATH}`);
  if (!r || r.status !== 200) {
    return (
      <div className="page">
        <h1 className="page-title">Savings Goals</h1>
        <p className="form-error" role="alert">This page couldn't be loaded. Refresh in a moment.</p>
      </div>
    );
  }
  const list = r.body;
  const active = list.goals.filter((g) => !g.archived);
  const toGo = Math.max(0, Number(list.totals.target) - Number(list.totals.saved));

  return (
    <div className="page money-page">
      <header className="money-head">
        <div>
          <h1 className="page-title">Savings Goals</h1>
          {active.length ? (
            <p className="goals-sum">
              <strong>{money(list.totals.saved, list.homeCurrency, { whole: true })}</strong> set aside for {active.length} {active.length === 1 ? "goal" : "goals"}
              {toGo > 0 ? <span className="muted"> · {money(toGo, list.homeCurrency, { whole: true })} to go</span> : null}
            </p>
          ) : null}
        </div>
        <div className="money-head-links">
          <Link className="btn ghost" href={MONEY_PATH}>Income & Expense</Link>
        </div>
      </header>
      <GoalsBoard list={list} />
    </div>
  );
}
