import { PERSONAL_FIRST_WAVE } from "@velaq/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { callName, currentUser } from "../../lib/session";
import { PLAN_NAME, getSpace, personalFeatures } from "../../lib/space";
import { GroupIcon } from "./_shell/icons";

export const metadata: Metadata = { title: "Home · Velaq" };

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AppHome() {
  const [user, data] = await Promise.all([currentUser(), getSpace()]);
  const groups = personalFeatures(data);
  const all = groups.flatMap((g) => g.features);
  const ready = all.filter((f) => f.state === "ready");
  const firstWave = all.filter((f) => (PERSONAL_FIRST_WAVE as readonly string[]).includes(f.id));
  const name = user ? callName(user) : "there";

  return (
    <div className="home">
      <section className="home-hero">
        <div>
          <p className="home-kicker">{greeting()},</p>
          <h1 className="home-title">{name}</h1>
          <p className="home-sub">
            {data
              ? <>You're on the <strong>{PLAN_NAME[data.space.plan]}</strong> plan. Everything here is private to you.</>
              : "Your space couldn't be loaded. Refresh the page, or try again in a moment."}
          </p>
        </div>
        <div className="home-stats" aria-label="Your features">
          <div><strong>{ready.length}</strong><span>ready to use</span></div>
          <div><strong>{all.filter((f) => f.state === "soon").length}</strong><span>on the way</span></div>
        </div>
      </section>

      {ready.length > 0 ? (
        <section className="home-section">
          <h2>Your features</h2>
          <div className="tile-grid">
            {ready.map((f) => (
              <Link key={f.id} href={f.href} className="tile tile-ready">
                <span className="tile-icon"><GroupIcon group={f.group} /></span>
                <span className="tile-name">{f.name}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="home-section">
        <h2>Coming first</h2>
        <p className="home-note">These open in your space as each one is finished. Nothing to set up.</p>
        <div className="tile-grid">
          {firstWave.map((f, i) => (
            <div key={f.id} className={`tile tile-${f.state}`} style={{ "--d": i } as React.CSSProperties}>
              <span className="tile-icon"><GroupIcon group={f.group} /></span>
              <span className="tile-name">{f.name}</span>
              <span className="tile-group">{f.group}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
