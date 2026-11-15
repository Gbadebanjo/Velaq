import Link from "next/link";
import { SiteFooter, SiteHeader } from "../_components/SiteHeader";

type Option = { key: string; title: string; body: string; cta: string; href: string | null; note?: string };

const options: Option[] = [
  {
    key: "business",
    title: "Velaq for Business",
    body: "Set up your organisation. You become its admin and invite your team.",
    cta: "Set up your organisation",
    href: null,
    note: "Joining your company? Use the invitation from your admin. You don't need to sign up here.",
  },
  {
    key: "personal",
    title: "Velaq Personal",
    body: "Manage your profile, documents, money and tasks. Run a business of one.",
    cta: "Create your free account",
    href: "/sign-up",
  },
  {
    key: "marketplace",
    title: "Velaq Marketplace",
    body: "Post opportunities, or find jobs and gigs from verified organisations.",
    cta: "Open Marketplace",
    href: null,
  },
];

export default async function Start({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="band">
        <div className="wrap">
          <h1 className="h1s">Choose your product</h1>
          <p className="muted">
            Velaq Personal opens first. Business and Marketplace follow. Already have an account? <Link href="/sign-in">Sign in</Link>.
          </p>
          <div className="choose">
            {options.map((o) => (
              <article key={o.key} className={`choice${product === o.key ? " selected" : ""}`}>
                <h2>{o.title}</h2>
                <p>{o.body}</p>
                {o.href ? (
                  <Link className="btn primary" href={o.href}>{o.cta}</Link>
                ) : (
                  <button className="btn primary" disabled aria-disabled="true">Coming soon</button>
                )}
                {o.note ? <p className="small muted">{o.note}</p> : null}
              </article>
            ))}
          </div>
          <p><Link href="/">Back to home</Link></p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
