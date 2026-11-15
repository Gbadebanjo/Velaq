"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "../../_auth/actions";

/** Avatar button with a small menu: who's signed in, account settings and sign out. */
export function AccountMenu({ email, name, initials }: { email: string; name: string | null; initials: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button className="avatar" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen((o) => !o)}>
        {initials}
      </button>
      {open ? (
        <div className="account-pop" role="menu">
          <div className="account-who">
            {name ? <p className="account-name">{name}</p> : null}
            <p className="account-email">{email}</p>
          </div>
          <Link href="/app/account" role="menuitem" onClick={() => setOpen(false)}>Account settings</Link>
          <form action={signOut}>
            <button type="submit" role="menuitem">Sign out</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
