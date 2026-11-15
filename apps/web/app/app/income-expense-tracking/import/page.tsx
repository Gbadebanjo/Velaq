import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "../../../../lib/api";
import { MONEY_PATH, type MoneySetup } from "../../../../lib/money";
import { sessionToken } from "../../../../lib/session";
import { ImportFlow } from "./ImportFlow";

export const metadata: Metadata = { title: "Import a statement · Velaq" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${MONEY_PATH}/import`);
  const s = await api<MoneySetup>("GET", "/v1/money/setup", { token }).catch(() => null);
  if (s?.status === 401) redirect(`/sign-in?next=${MONEY_PATH}/import`);
  return (
    <div className="page money-page">
      <p><Link className="text-btn back-link" href={MONEY_PATH}>‹ Income & Expense</Link></p>
      <div>
        <h1 className="page-title">Import a bank statement</h1>
        <p className="muted">Download your statement as a CSV file from your bank's app or internet banking, then add it here. You'll check every line before anything is saved.</p>
      </div>
      {s?.status === 200 ? <ImportFlow setup={s.body} /> : <p className="form-error" role="alert">This page couldn't be loaded. Refresh in a moment.</p>}
    </div>
  );
}
