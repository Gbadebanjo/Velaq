import Link from "next/link";
import { Logo } from "../_components/SiteHeader";

/** Split screen for every sign-in step: brand panel on wide screens, the form alone on phones. */
export function AuthLayout({ title, intro, children, footer, icon }: {
  title: string;
  /** A small picture above the title, for the steps that wait on an email. */
  icon?: "mail" | "key";
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="auth">
      <aside className="auth-brand" aria-hidden="true">
        <Link href="/" tabIndex={-1}><Logo onDark height={36} /></Link>
        <span className="auth-brand-ring" />
        <div className="auth-brand-copy">
          <p className="auth-brand-line">Your work, money and documents in one place.</p>
          <p className="auth-brand-sub">Velaq Personal keeps what's yours separate from any employer, and ready when you need it.</p>
        </div>
        <p className="auth-brand-foot">One Platform. Every Business Function.</p>
      </aside>
      <main className="auth-main">
        <Link href="/" aria-label="Velaq home" className="auth-mobile-logo"><Logo height={32} /></Link>
        <div className="auth-panel">
          {icon ? <AuthIcon kind={icon} /> : null}
          <h1 className="auth-title">{title}</h1>
          {intro ? <div className="auth-intro">{intro}</div> : null}
          {children}
        </div>
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </main>
    </div>
  );
}

function AuthIcon({ kind }: { kind: "mail" | "key" }) {
  return (
    <span className="auth-icon" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {kind === "mail" ? (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m4 7 8 6 8-6" />
          </>
        ) : (
          <>
            <circle cx="8" cy="15" r="4" />
            <path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l2 2" />
          </>
        )}
      </svg>
    </span>
  );
}
