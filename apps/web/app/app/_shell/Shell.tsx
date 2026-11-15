"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { FeatureView } from "../../../lib/space";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "../../_components/SiteHeader";
import { FeatureIcon, GroupIcon, IconChevron, IconHome, IconLock, IconMenu } from "./icons";

export interface ShellProps {
  email: string;
  /** Full name, or null for older accounts without one. */
  name: string | null;
  initials: string;
  planName: string;
  groups: { group: string; features: FeatureView[] }[];
  children: React.ReactNode;
}

/** The signed-in frame: side menu (a drawer on phones), top bar with the account menu, and the page. */
export function Shell({ email, name, initials, planName, groups, children }: ShellProps) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));

  return (
    <div className={`shell${open ? " nav-open" : ""}`}>
      <aside className="shell-nav" id="app-nav" aria-label="App">
        <div className="shell-brand">
          <Link href="/app" className="brand-link" aria-label="Velaq home">
            <Logo height={30} onDark />
          </Link>
        </div>
        <nav className="shell-links">
          <Link href="/app" className={`nav-item${active("/app") ? " is-active" : ""}`} aria-current={active("/app") ? "page" : undefined}>
            <IconHome /> <span>Home</span>
          </Link>
          {groups.map(({ group, features }) => (
            <NavGroup key={group} group={group} features={features} active={active} />
          ))}
        </nav>
        <Link href="/app/account" className={`nav-me${active("/app/account") ? " is-active" : ""}`} aria-current={active("/app/account") ? "page" : undefined}>
          <span className="nav-me-avatar" aria-hidden="true">{initials}</span>
          <span className="nav-me-text">
            <span className="nav-me-name">{name ?? email}</span>
            <span className="nav-me-plan">{planName} plan · Account</span>
          </span>
        </Link>
      </aside>
      <button className="shell-scrim" aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <div className="shell-main">
        <header className="shell-top">
          <button className="shell-menu-btn" aria-label="Open menu" aria-controls="app-nav" aria-expanded={open} onClick={() => setOpen(true)}>
            <IconMenu />
          </button>
          <span className="shell-plan">{planName} plan</span>
          <AccountMenu email={email} name={name} initials={initials} />
        </header>
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}

/** Shorter names for the menu, so nothing wraps. The full name shows on hover. */
const SHORT: Record<string, string> = {
  "PER-010": "Income & Expense",
  "PER-013": "Money Insights",
  "PER-020": "Invoices & Payments",
  "PER-022": "Freelance Income",
  "PER-040": "Find Opportunities",
  "PER-050": "AI Assistant",
};

const remembered = (group: string): boolean | null => {
  try {
    const v = localStorage.getItem(`velaq.nav.${group}`);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
};

/**
 * One menu group. Groups with something usable start open; groups that are all "soon" or need
 * another plan start closed with a short count. Whatever the person chooses is remembered on this device.
 */
function NavGroup({ group, features, active }: { group: string; features: FeatureView[]; active: (href: string) => boolean }) {
  const ready = features.filter((f) => f.state === "ready").length;
  const here = features.some((f) => f.state === "ready" && active(f.href));
  const [open, setOpen] = useState(ready > 0 || here);
  useEffect(() => {
    const r = remembered(group);
    if (r !== null) setOpen(r);
  }, [group]);
  const shown = open;
  const id = `nav-${group.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const toggle = () => {
    const next = !shown;
    setOpen(next);
    try {
      localStorage.setItem(`velaq.nav.${group}`, next ? "1" : "0");
    } catch {
      /* the choice just won't be remembered */
    }
  };
  const locked = features.filter((f) => f.state === "upgrade").length;
  const soon = features.filter((f) => f.state === "soon").length;
  return (
    <div className={`nav-group${shown ? " is-open" : ""}`}>
      <button type="button" className="nav-group-title" aria-expanded={shown} aria-controls={id} onClick={toggle}>
        <GroupIcon group={group} />
        <span className="ngt-name">{group}</span>
        {!shown && !ready ? (locked && !soon ? <span className="ngt-count lock" title="Needs another plan"><IconLock /></span> : <span className="ngt-count">Soon</span>) : null}
        <span className="ngt-chev"><IconChevron /></span>
      </button>
      <ul id={id} hidden={!shown}>
        {features.map((f) => (
          <li key={f.id}>
            {f.state === "ready" ? (
              <Link href={f.href} className={`nav-sub${active(f.href) ? " is-active" : ""}`} aria-current={active(f.href) ? "page" : undefined} title={SHORT[f.id] ? f.name : undefined}>
                <FeatureIcon id={f.id} />
                <span className="nav-sub-name">{SHORT[f.id] ?? f.name}</span>
              </Link>
            ) : (
              <span className="nav-sub is-off" title={f.state === "upgrade" ? `${f.name}: included in ${f.label}` : `${f.name}: coming soon`}>
                <FeatureIcon id={f.id} />
                <span className="nav-sub-name">{SHORT[f.id] ?? f.name}</span>
                {f.state === "upgrade" ? (
                  <span className="nav-lock"><IconLock /><span>{f.label}</span></span>
                ) : (
                  <span className="nav-soon">Soon</span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
