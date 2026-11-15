import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "../../../../lib/api";
import { type AiStatus, PROFILE_PATH, type Profile, TAILOR_PATH, str } from "../../../../lib/profile";
import { sessionToken } from "../../../../lib/session";
import { TailorFlow } from "./TailorFlow";

export const metadata: Metadata = { title: "Tailor for a job · Velaq" };
export const dynamic = "force-dynamic";

export default async function TailorPage() {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${TAILOR_PATH}`);
  const [p, ai] = await Promise.all([
    api<Profile & { message?: string }>("GET", "/v1/profile", { token }),
    api<AiStatus & { message?: string }>("GET", "/v1/profile/ai", { token }),
  ]).catch(() => [null, null] as const);
  if (p?.status === 401 || ai?.status === 401) redirect(`/sign-in?next=${TAILOR_PATH}`);

  return (
    <div className="page tailor-page">
      <p><Link className="back-link" href={PROFILE_PATH}>← Professional Profile</Link></p>
      <header>
        <h1 className="page-title">Tailor for a job</h1>
        <p className="muted">Velaq's AI suggests how to present your saved profile for one job. It only rewords and reorders what you already wrote. You approve every change, and your main profile stays as it is.</p>
      </header>
      {!p || !ai || p.status !== 200 || ai.status !== 200 ? (
        <p className="form-error" role="alert">This page couldn't be loaded. Refresh in a moment.</p>
      ) : (
        <TailorFlow
          status={ai.body}
          jobOrder={p.body.entries.experience.map((e) => e.id)}
          titles={Object.fromEntries([...p.body.entries.portfolio.map((e) => [e.id, str(e.data.title)]), ...p.body.entries.certification.map((e) => [e.id, str(e.data.name)])])}
        />
      )}
    </div>
  );
}
