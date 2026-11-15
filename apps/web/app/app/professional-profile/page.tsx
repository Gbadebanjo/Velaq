import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api } from "../../../lib/api";
import { PROFILE_PATH, type Profile, TAILOR_PATH, type VersionSummary, fullName } from "../../../lib/profile";
import { sessionToken } from "../../../lib/session";
import { SharePanel, TemplatePicker } from "./Editors";
import { ProfileEditor } from "./ProfileEditor";
import { Versions } from "./Versions";

export const metadata: Metadata = { title: "Professional Profile · Velaq" };
export const dynamic = "force-dynamic";

async function loadProfile(): Promise<{ profile?: Profile; problem?: string; versions: VersionSummary[] }> {
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${PROFILE_PATH}`);
  try {
    const [r, v] = await Promise.all([
      api<Profile & { message?: string }>("GET", "/v1/profile", { token }),
      api<VersionSummary[]>("GET", "/v1/profile/versions", { token }),
    ]);
    if (r.status === 401) redirect(`/sign-in?next=${PROFILE_PATH}`);
    if (r.status === 200) return { profile: r.body, versions: v.status === 200 ? v.body : [] };
    return { problem: r.body.message ?? "Your profile couldn't be loaded.", versions: [] };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // let redirect() through
    return { problem: "Velaq can't be reached right now. Refresh in a moment.", versions: [] };
  }
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { profile, problem, versions } = await loadProfile();
  if (!profile) {
    return (
      <div className="page">
        <h1 className="page-title">Professional Profile</h1>
        <p className="form-error" role="alert">{problem}</p>
      </div>
    );
  }
  const name = fullName(profile.person);
  const { percent, missing } = profile.completeness;

  return (
    <div className="page pf-page">
      <header className="pf-hero">
        <div className="pf-hero-text">
          <p className="pf-kicker">Professional Profile</p>
          <h1 className="page-title">{name || "Your profile"}</h1>
          <p className="pf-headline">{profile.basics.headline || "Add a headline below, like “Product Designer”."}</p>
          {!name ? <p className="muted small">Add your name in <Link href="/app/account">Account</Link>.</p> : null}
        </div>
        <div className="pf-hero-side">
          <div className="meter" role="img" aria-label={`Profile ${percent}% complete`}>
            <div className="meter-track"><div className="meter-fill" style={{ width: `${percent}%` }} /></div>
            <p className="meter-label"><strong>{percent}%</strong> complete</p>
          </div>
          <a className="btn primary" href={`${PROFILE_PATH}/cv`} download>Download CV (PDF)</a>
          <Link className="btn ghost on-dark" href={TAILOR_PATH}>Tailor for a job</Link>
          <p className="muted small pf-dirty-note">Downloads use your saved profile. Save your changes first to include them.</p>
        </div>
      </header>

      {missing.length ? (
        <p className="pf-next"><strong>To finish your profile:</strong> add {missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}` : missing[0]}.</p>
      ) : null}

      <TemplatePicker value={profile.cvTemplate} />

      <Versions versions={versions} justSaved={saved} />

      <SharePanel share={profile.share} showEmail={profile.basics.showEmail} />

      <ProfileEditor profile={profile} />
    </div>
  );
}
