import Link from "next/link";
import { IconBridge, IconBuilding, IconLink, IconPerson, IconPin, IconShield, IconSpark, IconToggle } from "./_components/Icons";
import { PlatformDiagram } from "./_components/PlatformDiagram";
import { Reveal } from "./_components/Reveal";
import { SiteFooter, SiteHeader } from "./_components/SiteHeader";

const plans = [
  {
    name: "Free",
    who: "For everyone",
    body: "Your profile, a vault for your documents, income and spending, budgets, savings goals, tasks, notes and a calendar. Browse jobs too.",
  },
  {
    name: "Premium",
    who: "For professionals",
    body: "Everything in Free, plus deeper budgeting insights, a personal AI assistant and more storage.",
  },
  {
    name: "Hustle",
    who: "For freelancers and side businesses",
    body: "Everything in Premium, plus invoices with payment links, your clients in one list, freelance income records and paid gigs.",
  },
];

export default function Home() {
  return (
    <>
      <Reveal />
      <div className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <SiteHeader onDark />
        <section className="wrap hero-grid">
          <div className="hero-copy">
            <h1 className="display">One platform. Every business function.</h1>
            <p className="lede">
              Velaq brings your people, money, operations and customers into one place, so your team stops copying data between tools and starts running the business.
            </p>
            <div className="row gap hero-actions">
              <Link className="btn primary lg" href="/start">Get started</Link>
              <Link className="btn outline-light lg" href="/sign-in">Sign in</Link>
            </div>
          </div>
          <PlatformDiagram />
        </section>
      </div>

      <main>
        <section id="products" className="band">
          <div className="wrap">
            <h2 className="h2" data-reveal>Two products, one foundation</h2>
            <p className="intro" data-reveal>
              Organisations and individuals each get their own space. Company data stays with the company. Personal data belongs to the person.
            </p>
            <div className="products">
              <article className="product product-biz" data-reveal style={{ "--d": 0 } as React.CSSProperties}>
                <span className="product-icon"><IconBuilding /></span>
                <h3>Velaq for Business</h3>
                <p>
                  Run HR, payroll, finance, projects, sales and support from one system. Start with what you need today and switch on more as you grow. You pay for what you use.
                </p>
              </article>
              <article className="product product-per" data-reveal style={{ "--d": 1 } as React.CSSProperties}>
                <span className="product-icon"><IconPerson /></span>
                <h3>Velaq Personal</h3>
                <p>
                  A workspace for professionals and freelancers: keep your documents and CV, track your money, plan your week, and invoice your clients if you run a business of one.
                </p>
                <Link className="text-link" href="/sign-up">Create your free account</Link>
              </article>
              <article className="product product-mkp" data-reveal style={{ "--d": 2 } as React.CSSProperties}>
                <span className="product-icon"><IconBridge /></span>
                <h3>Velaq Marketplace</h3>
                <p>
                  Where the two meet. Verified organisations post jobs and gigs, and people choose what to apply for. Nothing else crosses between them.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="how" className="band band-tint">
          <div className="wrap how">
            <h2 className="h2" data-reveal>Built to fit how you work</h2>
            <dl className="points">
              <div data-reveal style={{ "--d": 0 } as React.CSSProperties}>
                <dt><span className="point-icon"><IconToggle /></span>Switch on what you need</dt>
                <dd>Every capability is its own feature. Turn on payroll without buying a whole suite, and add more when you're ready.</dd>
              </div>
              <div data-reveal style={{ "--d": 1 } as React.CSSProperties}>
                <dt><span className="point-icon"><IconLink /></span>Everything connects</dt>
                <dd>One record for each person, customer and transaction. Payroll knows who's on leave. Invoices know your customers. Nothing is typed twice.</dd>
              </div>
              <div data-reveal style={{ "--d": 2 } as React.CSSProperties}>
                <dt><span className="point-icon"><IconPin /></span>Made for local business</dt>
                <dd>Naira and local payroll rules from day one, Paystack and Flutterwave alongside card payments, and screens that work on everyday phones and patchy connections.</dd>
              </div>
              <div data-reveal style={{ "--d": 3 } as React.CSSProperties}>
                <dt><span className="point-icon"><IconSpark /></span>AI that knows its limits</dt>
                <dd>Ask questions and get drafts across your work. The assistant sees only what you're allowed to see and asks before it acts.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="plans" className="band">
          <div className="wrap">
            <h2 className="h2" data-reveal>Velaq Personal plans</h2>
            <p className="intro" data-reveal>Start free. Upgrade when your work needs more. Prices will be announced at launch.</p>
            <div className="plans">
              {plans.map((p, i) => (
                <article key={p.name} className="plan" data-reveal style={{ "--d": i } as React.CSSProperties}>
                  <h3>{p.name}</h3>
                  <p className="plan-who">{p.who}</p>
                  <p>{p.body}</p>
                </article>
              ))}
            </div>
            <p className="note">
              Velaq for Business is billed per feature and per user, so a team pays only for what it switches on.
            </p>
          </div>
        </section>

        <section id="trust" className="band band-navy">
          <div className="wrap trust">
            <div data-reveal>
              <span className="trust-badge"><IconShield /></span>
              <h2 className="h2">Your data stays yours</h2>
            </div>
            <ul className="trust-list">
              <li data-reveal style={{ "--d": 0 } as React.CSSProperties}><strong>Separate by design.</strong> Each organisation's data is walled off at the database, and business and personal data live in separate databases.</li>
              <li data-reveal style={{ "--d": 1 } as React.CSSProperties}><strong>Sensitive fields locked down.</strong> Salaries, bank details and ID numbers are encrypted on their own and never shown to people who shouldn't see them.</li>
              <li data-reveal style={{ "--d": 2 } as React.CSSProperties}><strong>You control who gets in.</strong> The person who sets up an organisation becomes its admin. Everyone else joins by invitation, and leavers lose access within a minute.</li>
              <li data-reveal style={{ "--d": 3 } as React.CSSProperties}><strong>We never hold your money.</strong> Payments go straight through licensed providers. Velaq follows Nigeria's data protection law and GDPR.</li>
            </ul>
          </div>
        </section>

        <section className="band closing">
          <div className="wrap">
            <div className="closing-card" data-reveal>
            <h2 className="h2">Start with one feature. Grow into the rest.</h2>
              <Link className="btn light lg" href="/start">Get started</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
