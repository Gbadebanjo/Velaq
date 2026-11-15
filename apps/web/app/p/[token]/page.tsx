import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Logo } from "../../_components/SiteHeader";
import { ApiUnreachable, api } from "../../../lib/api";
import { type Entry, type SharedProfile, dateRange, displayUrl, fullName, monthLabel, str } from "../../../lib/profile";

export const dynamic = "force-dynamic";

const load = cache(async (token: string): Promise<SharedProfile | "down" | null> => {
  try {
    const r = await api<SharedProfile>("GET", `/v1/shared-profiles/${encodeURIComponent(token)}`);
    return r.status === 200 ? r.body : null;
  } catch (e) {
    if (e instanceof ApiUnreachable) return "down";
    throw e;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const p = await load((await params).token);
  const name = p && p !== "down" ? fullName(p.person) : "";
  // A shared link is private to whoever has it: keep it out of search engines and link previews.
  return { title: name ? `${name} · Profile` : "Profile", robots: { index: false, follow: false }, referrer: "no-referrer" };
}

function Item({ title, when, sub, body, href }: { title: string; when?: string; sub?: string; body?: string; href?: string }) {
  return (
    <li className="sp-item">
      <div className="sp-item-head">
        <h3>{href ? <a href={href} rel="noopener noreferrer nofollow" target="_blank">{title}</a> : title}</h3>
        {when ? <p className="sp-when">{when}</p> : null}
      </div>
      {sub ? <p className="sp-sub">{sub}</p> : null}
      {body ? <p className="sp-body">{body}</p> : null}
    </li>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sp-block">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

type ItemProps = React.ComponentProps<typeof Item>;
const list = (entries: Entry[] | undefined, render: (d: Entry["data"]) => ItemProps) =>
  entries?.length ? <ul className="sp-list">{entries.map((e) => <Item key={e.id} {...render(e.data)} />)}</ul> : null;

export default async function SharedProfilePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await load(token);
  if (p === "down") {
    return <main className="sp-page"><div className="sp-card sp-empty"><p>This profile can't be reached right now. Try again in a moment.</p></div></main>;
  }
  if (!p) notFound();

  const name = fullName(p.person) || "Profile";
  const contact = [p.basics.location, p.person.email, p.basics.phone].filter(Boolean) as string[];
  const links = [
    ...(p.basics.website ? [{ label: displayUrl(p.basics.website), url: p.basics.website }] : []),
    ...(p.entries.link ?? []).map((l) => ({ label: str(l.data.label), url: str(l.data.url) })),
  ];
  const nothing = !p.basics.headline && !p.basics.about && !contact.length && !links.length && !p.skills?.length && !Object.keys(p.entries).length;

  return (
    <main className="sp-page">
      <article className="sp-card">
        <header className="sp-head">
          <div>
            <h1>{name}</h1>
            {p.basics.headline ? <p className="sp-headline">{p.basics.headline}</p> : null}
            {contact.length ? (
              <ul className="sp-contact">
                {contact.map((c) => <li key={c}>{c.includes("@") ? <a href={`mailto:${c}`}>{c}</a> : c}</li>)}
              </ul>
            ) : null}
            {links.length ? (
              <ul className="sp-links">
                {links.map((l) => <li key={l.url}><a href={l.url} rel="noopener noreferrer nofollow" target="_blank">{l.label}</a></li>)}
              </ul>
            ) : null}
          </div>
          <a className="btn primary" href={`/p/${encodeURIComponent(token)}/cv`} download>Download CV</a>
        </header>

        {nothing ? <p className="sp-empty-note">{name} hasn't shared any details yet.</p> : null}

        {p.basics.about ? <Block title="About"><p className="sp-about">{p.basics.about}</p></Block> : null}

        {p.skills?.length ? (
          <Block title="Skills">
            <ul className="sp-skills">{p.skills.map((s) => <li key={s}>{s}</li>)}</ul>
          </Block>
        ) : null}

        {p.entries.experience?.length ? (
          <Block title="Experience">
            {list(p.entries.experience, (d) => ({ title: str(d.role), when: dateRange(d.start, d.end, d.current === true), sub: [str(d.organisation), str(d.location)].filter(Boolean).join(" · "), body: str(d.description) }))}
          </Block>
        ) : null}

        {p.entries.portfolio?.length ? (
          <Block title="Projects">
            {list(p.entries.portfolio, (d) => ({ title: str(d.title), sub: displayUrl(d.url), body: str(d.description), href: str(d.url) }))}
          </Block>
        ) : null}

        {p.entries.education?.length ? (
          <Block title="Education">
            {list(p.entries.education, (d) => ({ title: str(d.school), when: dateRange(d.start, d.end, d.current === true), sub: [str(d.qualification), str(d.field)].filter(Boolean).join(", "), body: str(d.description) }))}
          </Block>
        ) : null}

        {p.entries.certification?.length ? (
          <Block title="Certifications">
            {list(p.entries.certification, (d) => ({
              title: str(d.name),
              when: [monthLabel(d.issued) && `Issued ${monthLabel(d.issued)}`, monthLabel(d.expires) && `Expires ${monthLabel(d.expires)}`].filter(Boolean).join(" · "),
              sub: [str(d.issuer), str(d.credentialId) && `Credential ${str(d.credentialId)}`].filter(Boolean).join(" · "),
              href: str(d.url) || undefined,
            }))}
          </Block>
        ) : null}
      </article>
      <footer className="sp-foot"><Logo height={18} /><span>Shared with Velaq</span></footer>
    </main>
  );
}
