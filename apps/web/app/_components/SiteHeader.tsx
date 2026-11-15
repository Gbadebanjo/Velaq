import Link from "next/link";

export function Logo({ height = 34, onDark = false }: { height?: number; onDark?: boolean }) {
  if (onDark) {
    return <img src="/brand/logo-dark.png" alt="Velaq" height={height} style={{ height, width: "auto", display: "block" }} />;
  }
  return (
    <picture>
      <source srcSet="/brand/logo-dark.png" media="(prefers-color-scheme: dark)" />
      <img src="/brand/logo-light.png" alt="Velaq" height={height} style={{ height, width: "auto", display: "block" }} />
    </picture>
  );
}

export function SiteHeader({ onDark = false }: { onDark?: boolean }) {
  return (
    <header className={`site-header${onDark ? " on-dark" : ""}`}>
      <div className="wrap row between">
        <Link href="/" aria-label="Velaq home"><Logo onDark={onDark} /></Link>
        <nav className="nav" aria-label="Main">
          <a href="/#products">Products</a>
          <a href="/#how">How it works</a>
          <a href="/#plans">Personal plans</a>
          <a href="/#trust">Trust</a>
        </nav>
        <div className="row gap">
          <Link className="btn ghost" href="/sign-in">Sign in</Link>
          <Link className="btn primary" href="/start">Get started</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap row between wrapflow">
        <Logo height={28} />
        <p className="muted small">One Platform. One Workforce. One Business. Unlimited Possibilities.</p>
        <p className="muted small">© {new Date().getFullYear()} Velaq</p>
      </div>
    </footer>
  );
}
