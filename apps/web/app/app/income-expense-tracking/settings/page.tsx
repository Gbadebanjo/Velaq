import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "../../../../lib/api";
import { MONEY_PATH, type MoneySetup } from "../../../../lib/money";
import { sessionToken } from "../../../../lib/session";
import { MoneySettings } from "./MoneySettings";

export const metadata: Metadata = { title: "Accounts & categories · Velaq" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${MONEY_PATH}/settings`);
  const s = await api<MoneySetup>("GET", "/v1/money/setup", { token }).catch(() => null);
  if (s?.status === 401) redirect(`/sign-in?next=${MONEY_PATH}/settings`);
  return (
    <div className="page money-page">
      <p><Link className="text-btn back-link" href={MONEY_PATH}>‹ Income & Expense</Link></p>
      <h1 className="page-title">Accounts & categories</h1>
      {s?.status === 200 ? <MoneySettings setup={s.body} /> : <p className="form-error" role="alert">This page couldn't be loaded. Refresh in a moment.</p>}
    </div>
  );
}
