"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { PROFILE_PATH, TAILOR_PATH, type VersionSummary } from "../../../lib/profile";
import { CvPreview } from "./CvPreview";
import { deleteVersion } from "./tailor/actions";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date(iso));

/** The person's tailored versions: one per job, each with preview, download and delete. */
export function Versions({ versions, justSaved }: { versions: VersionSummary[]; justSaved?: string }) {
  const [previewing, setPreviewing] = useState<VersionSummary | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const opener = useRef<HTMLButtonElement | null>(null);

  return (
    <section className="panel" id="versions" aria-labelledby="versions-title">
      <div className="panel-head">
        <div>
          <h2 id="versions-title">Tailored versions</h2>
          <p className="muted small">A copy of your CV adapted to one job. Your main profile stays as it is.</p>
        </div>
        <Link className="btn ghost" href={TAILOR_PATH}>Tailor for a job</Link>
      </div>
      {justSaved && versions.some((v) => v.id === justSaved) ? <p className="form-notice" role="status">Tailored version saved.</p> : null}
      {versions.length ? (
        <ul className="entry-list">
          {versions.map((v) => (
            <li key={v.id} className={`entry ${v.id === justSaved ? "fresh" : ""}`}>
              <div className="entry-row">
                <div className="entry-main">
                  <p className="entry-title">{v.name}</p>
                  <p className="entry-sub">{[v.jobTitle, v.company].filter(Boolean).join(" at ")} · {when(v.createdAt)}</p>
                </div>
                {confirming === v.id ? (
                  <div className="entry-actions confirm" role="group" aria-label="Confirm deletion">
                    <span>Delete this version?</span>
                    <button
                      type="button"
                      className="btn danger sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await deleteVersion(v.id);
                          setConfirming(null);
                          setError(r.ok ? "" : r.message ?? "It couldn't be deleted. Try again.");
                        })
                      }
                    >
                      Delete
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setConfirming(null)}>Keep</button>
                  </div>
                ) : (
                  <div className="entry-actions">
                    <button type="button" className="text-btn" aria-haspopup="dialog" onClick={(e) => { opener.current = e.currentTarget; setPreviewing(v); }}>Preview</button>
                    <a className="text-btn" href={`${PROFILE_PATH}/versions/${v.id}/cv`} download>Download</a>
                    <button type="button" className="text-btn danger" onClick={() => setConfirming(v.id)}>Delete</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None yet. Tailor your CV for a job you're applying to, and it will be kept here.</p>
      )}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {previewing ? (
        <CvPreview
          title={previewing.name}
          subtitle="Tailored version, in your chosen design"
          href={`${PROFILE_PATH}/versions/${previewing.id}/cv`}
          onClose={() => {
            setPreviewing(null);
            const back = opener.current;
            requestAnimationFrame(() => back?.focus());
          }}
        />
      ) : null}
    </section>
  );
}
