"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CV_TEMPLATES, type CvTemplate, PROFILE_PATH, type Profile } from "../../../lib/profile";
import { createShareLink, removeShareLink, setCvTemplate } from "./actions";
import { CvPreview } from "./CvPreview";

// ---------------------------------------------------------------------------------------------
// Share link: one link to the whole profile.

export function SharePanel({ share, showEmail }: { share: Profile["share"]; showEmail: boolean }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ message?: string; notice?: string }>({});
  useEffect(() => setOrigin(window.location.origin), []);
  const url = share ? `${origin}/p/${share.token}` : "";

  const run = (fn: () => Promise<{ message?: string; notice?: string }>) =>
    start(async () => {
      setCopied(false);
      setStatus(await fn());
    });

  return (
    <section className="panel share-panel" aria-labelledby="share-title">
      <div className="panel-head">
        <h2 id="share-title">Share your profile</h2>
        <span className={`pill ${share ? "on" : ""}`}>{share ? "Link on" : "Link off"}</span>
      </div>
      <p className="muted">
        {share ? "Anyone with this link sees your whole profile as saved" : "Create a private link to send to recruiters or clients. They'll see your whole profile as saved"}
        {showEmail ? ", including your email." : ". Your email stays hidden unless you tick “Show my email” under Contact."}
        {share ? "" : " You can turn the link off at any time."}
      </p>
      {share ? (
        <>
          <div className="share-url">
            <label htmlFor="share-url" className="visually-hidden">Your share link</label>
            <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                } catch {
                  setStatus({ message: "Couldn't copy. Select the link and copy it yourself." });
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="row gap">
            <a className="btn ghost" href={`/p/${share.token}`} target="_blank" rel="noopener">See what they see</a>
            <button type="button" className="btn ghost" disabled={pending} onClick={() => run(() => createShareLink(true))}>Make a new link</button>
            <button type="button" className="text-btn danger" disabled={pending} onClick={() => run(removeShareLink)}>Turn off link</button>
          </div>
        </>
      ) : (
        <div><button type="button" className="btn primary" disabled={pending} onClick={() => run(() => createShareLink(false))}>{pending ? "Creating…" : "Create a share link"}</button></div>
      )}
      {status.message ? <p className="form-error" role="alert">{status.message}</p> : status.notice ? <p className="form-notice" role="status">{status.notice}</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// CV design

/** Picks the CV design. The choice saves straight away and applies to every download, including from the share link. */
export function TemplatePicker({ value }: { value: CvTemplate }) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState<CvTemplate | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const choose = (t: CvTemplate) => {
    if (t === current) return;
    const before = current;
    setCurrent(t);
    setError("");
    start(async () => {
      const r = await setCvTemplate(t);
      if (!r.saved) {
        setCurrent(before);
        setError(r.message ?? "Couldn't change your CV design. Try again.");
      }
    });
  };
  return (
    <section className="panel" aria-labelledby="cv-design-title">
      <div className="panel-head">
        <div>
          <h2 id="cv-design-title">CV design</h2>
          <p className="muted small">Used whenever your CV is downloaded, by you or from your share link.</p>
        </div>
      </div>
      <div className="templates" role="radiogroup" aria-labelledby="cv-design-title" aria-busy={pending}>
        {CV_TEMPLATES.map((t) => {
          const on = current === t.id;
          return (
            <div key={t.id} className={`template ${on ? "on" : ""}`}>
              <button type="button" role="radio" aria-checked={on} className="template-pick" onClick={() => choose(t.id)}>
                <span className="template-thumb"><img src={`/cv-templates/${t.id}.png`} alt="" width={210} height={297} loading="lazy" /></span>
                <span className="template-name">{t.name}{on ? <span className="pill on">In use</span> : null}</span>
                <span className="template-about">{t.about}</span>
              </button>
              <button
                type="button"
                className="text-btn template-preview"
                aria-haspopup="dialog"
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  setPreviewing(t.id);
                }}
              >
                Preview with my details
              </button>
            </div>
          );
        })}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {previewing ? (
        <CvPreview
          title={`${CV_TEMPLATES.find((t) => t.id === previewing)?.name ?? "CV"} preview`}
          subtitle="Your saved profile"
          href={`${PROFILE_PATH}/cv?template=${previewing}`}
          actions={
            previewing !== current ? (
              <button type="button" className="btn primary" onClick={() => { choose(previewing); setPreviewing(null); }}>Use this design</button>
            ) : (
              <span className="pill on">In use</span>
            )
          }
          onClose={() => {
            setPreviewing(null);
            // Back to the button that opened it, once the window has gone.
            const back = opener.current;
            requestAnimationFrame(() => back?.focus());
          }}
        />
      ) : null}
    </section>
  );
}
