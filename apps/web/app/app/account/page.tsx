import type { Metadata } from "next";
import { currentUser } from "../../../lib/session";
import { PLAN_NAME, getSpace } from "../../../lib/space";
import { signOut } from "../../_auth/actions";
import { NameForm } from "./NameForm";
import { signOutEverywhere } from "./actions";

export const metadata: Metadata = { title: "Account · Velaq" };

export default async function AccountPage() {
  const [user, data] = await Promise.all([currentUser(), getSpace()]);
  const since = data ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(data.space.createdAt)) : "—";

  return (
    <div className="page">
      <h1 className="page-title">Account</h1>
      <section className="panel">
        <h2>Your name</h2>
        <p className="muted">{user?.firstName ? "This is how Velaq greets you and signs your emails." : "Add your name so Velaq can greet you properly."}</p>
        <NameForm firstName={user?.firstName ?? ""} lastName={user?.lastName ?? ""} />
      </section>
      <section className="panel">
        <h2>Your details</h2>
        <dl className="details">
          <div><dt>Email</dt><dd>{user?.email}</dd></div>
          <div><dt>Plan</dt><dd>{PLAN_NAME[data?.space.plan ?? "free"]}</dd></div>
          <div><dt>Member since</dt><dd>{since}</dd></div>
        </dl>
      </section>
      <section className="panel">
        <h2>Sessions</h2>
        <p className="muted">If you signed in on a device you no longer use, or think someone else has your password, sign out everywhere. You'll need to sign in again here too.</p>
        <div className="row gap panel-actions">
          <form action={signOut}><button className="btn ghost" type="submit">Sign out</button></form>
          <form action={signOutEverywhere}><button className="btn danger" type="submit">Sign out of all devices</button></form>
        </div>
      </section>
    </div>
  );
}
