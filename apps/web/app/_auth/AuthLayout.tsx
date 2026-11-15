import Link from "next/link";
import { Logo } from "../_components/SiteHeader";

/** Split screen for every sign-in step: brand panel on wide screens, the form alone on phones. */
export function AuthLayout({ title, intro, children, footer }: {
  title: string;
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
          <h1 className="auth-title">{title}</h1>
          {intro ? <div className="auth-intro">{intro}</div> : null}
          {children}
        </div>
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </main>
    </div>
  );
}
