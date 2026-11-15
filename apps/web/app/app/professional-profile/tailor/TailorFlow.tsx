"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { type AiStatus, PROFILE_PATH, type Suggestions } from "../../../../lib/profile";
import { Checkbox, TextArea, TextField } from "../parts";
import { saveVersion, tailor } from "./actions";

/*
 * Tailor for a job, in two steps:
 *   1. The person describes the job. Velaq sends their saved profile and the job to the AI.
 *   2. They review every suggestion beside the original, choose and edit, then save the result
 *      as a tailored version. The main profile never changes.
 */

const CONSENT_KEY = "velaq.tailor.consent";

interface Choice {
  use: boolean;
  text: string;
}

export function TailorFlow({ status, titles, jobOrder }: {
  status: AiStatus;
  /** Names of projects and certifications by id, to show the suggested order. */
  titles: Record<string, string>;
  /** Job ids in the order the main profile has them. */
  jobOrder: string[];
}) {
  const [job, setJob] = useState({ jobTitle: "", company: "", jobDescription: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [left, setLeft] = useState(status.remainingToday);
  const [working, start] = useTransition();

  // Remember the person's agreement on this device, so they aren't asked every time.
  useEffect(() => {
    try {
      setConsent(localStorage.getItem(CONSENT_KEY) === "yes");
    } catch {
      /* private browsing: ask each time */
    }
  }, []);

  if (!status.available) {
    return (
      <section className="panel tailor-off">
        <h2>AI tailoring isn't set up yet</h2>
        <p className="muted">It needs a Claude API key on the server. Once it's added, this page will work without any other change.</p>
        <div><Link className="btn ghost" href={PROFILE_PATH}>Back to your profile</Link></div>
      </section>
    );
  }

  if (suggestions) {
    return <Review job={job} s={suggestions} titles={titles} jobOrder={jobOrder} onRestart={() => setSuggestions(null)} />;
  }

  const run = () =>
    start(async () => {
      setMessage("");
      setErrors({});
      if (!consent) {
        setErrors({ consent: "Tick the box to agree before Velaq sends your profile to the AI." });
        return;
      }
      try {
        localStorage.setItem(CONSENT_KEY, "yes");
      } catch {
        /* fine */
      }
      const r = await tailor(job);
      if (r.ok) {
        setLeft((n) => Math.max(0, n - 1));
        setSuggestions(r.ok);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrors(r.fields ?? {});
        setMessage(r.message ?? "That didn't work. Try again.");
        if (!r.fields) setLeft((n) => Math.max(0, n - 1));
      }
    });

  return (
    <form
      className="panel tailor-form"
      noValidate
      aria-busy={working}
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <div>
        <h2>The job</h2>
        <p className="muted small">Paste the advert or the part that lists responsibilities and requirements.</p>
      </div>
      <div className="field-pair">
        <TextField label="Job title" value={job.jobTitle} onChange={(v) => setJob({ ...job, jobTitle: v })} maxLength={120} required placeholder="e.g. Senior Product Designer" error={errors.jobTitle} />
        <TextField label="Company" value={job.company} onChange={(v) => setJob({ ...job, company: v })} maxLength={120} optional error={errors.company} />
      </div>
      <TextArea label="Job description" value={job.jobDescription} onChange={(v) => setJob({ ...job, jobDescription: v })} maxLength={12000} rows={10} error={errors.jobDescription} />
      <div className={`consent ${errors.consent ? "has-error" : ""}`}>
        <Checkbox
          label="Send my saved profile and this job description to Claude, Anthropic's AI, to create suggestions."
          hint="Only the profile and the job are sent, and only now. Under Anthropic's commercial terms, they aren't used to train its models."
          checked={consent}
          onChange={setConsent}
        />
        {errors.consent ? <p className="field-error">{errors.consent}</p> : null}
      </div>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      <div className="pf-actions">
        <button type="submit" className="btn primary" disabled={working || left === 0}>{working ? "Tailoring… this takes a few seconds" : "Tailor my CV"}</button>
        <span className="muted small">{left === 0 ? "You've used today's tailorings. Try again tomorrow." : `${left} of ${status.dailyLimit} left today`}</span>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

function Review({ job, s, titles, jobOrder, onRestart }: {
  job: { jobTitle: string; company: string; jobDescription: string };
  s: Suggestions;
  titles: Record<string, string>;
  jobOrder: string[];
  onRestart: () => void;
}) {
  const router = useRouter();
  const changed = (c: { suggested: string; original: string; kept: boolean }) => !c.kept && c.suggested !== c.original;
  const [headline, setHeadline] = useState<Choice>({ use: changed(s.headline), text: s.headline.suggested });
  const [about, setAbout] = useState<Choice>({ use: changed(s.about), text: s.about.suggested });
  const [jobs, setJobs] = useState<Record<string, Choice>>(() => Object.fromEntries(s.experience.map((e) => [e.id, { use: changed(e), text: e.suggested }])));
  const [skills, setSkills] = useState<string[]>(s.skills.suggested);
  const [useOrder, setUseOrder] = useState(true);
  const [name, setName] = useState([job.jobTitle, job.company].filter(Boolean).join(" – ").slice(0, 120));
  const [error, setError] = useState("");
  const [saving, start] = useTransition();

  const suggestedJobOrder = s.experience.map((e) => e.id);
  const orderChanged =
    suggestedJobOrder.join() !== jobOrder.join() ||
    s.projects.suggested.join() !== s.projects.original.join() ||
    s.certifications.suggested.join() !== s.certifications.original.join();
  const byId = new Map(s.experience.map((e) => [e.id, e]));

  const save = () =>
    start(async () => {
      setError("");
      const r = await saveVersion({
        name,
        jobTitle: job.jobTitle,
        company: job.company,
        jobDescription: job.jobDescription,
        changes: {
          headline: headline.use ? headline.text : s.headline.original,
          about: about.use ? about.text : s.about.original,
          skills,
          experience: (useOrder ? suggestedJobOrder : jobOrder)
            .map((id) => byId.get(id))
            .filter((e) => e !== undefined)
            .map((e) => ({ id: e.id, description: jobs[e.id]!.use ? jobs[e.id]!.text : e.original })),
          projects: useOrder ? s.projects.suggested : s.projects.original,
          certifications: useOrder ? s.certifications.suggested : s.certifications.original,
        },
      });
      if (r.ok) router.push(`${PROFILE_PATH}?saved=${encodeURIComponent(r.ok.id)}#versions`);
      else setError(r.fields ? Object.values(r.fields)[0]! : r.message ?? "This version couldn't be saved. Try again.");
    });

  return (
    <div className="tailor-review">
      <section className="panel tailor-summary">
        <div>
          <h2>Suggestions for {job.jobTitle}{job.company ? ` at ${job.company}` : ""}</h2>
          {s.summary ? <p>{s.summary}</p> : null}
          <p className="muted small">Nothing changes in your main profile. Choose what to use, edit anything, then save it as a tailored version.</p>
        </div>
        {s.gaps.length ? (
          <div className="gaps">
            <h3>The job asks for these, which your profile doesn't show</h3>
            <ul>{s.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            <p className="muted small">Only add them to your main profile if they're true.</p>
          </div>
        ) : null}
      </section>

      <Compare title="Headline" change={s.headline} choice={headline} onChange={setHeadline} single />
      <Compare title="About me" change={s.about} choice={about} onChange={setAbout} />

      <section className="panel compare">
        <div className="compare-head">
          <h2>Skills</h2>
          <p className="muted small">Most relevant to the job first. Untick any you'd rather not show for this job.</p>
        </div>
        <ul className="chips">
          {s.skills.suggested.map((sk) => {
            const on = skills.includes(sk);
            return (
              <li key={sk}>
                <label className={`chip pick ${on ? "" : "off"}`}>
                  <input type="checkbox" checked={on} onChange={(e) => setSkills((list) => (e.target.checked ? s.skills.suggested.filter((x) => x === sk || list.includes(x)) : list.filter((x) => x !== sk)))} />
                  {sk}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {s.experience.map((e) => (
        <Compare
          key={e.id}
          title={e.role}
          subtitle={e.organisation}
          change={e}
          choice={jobs[e.id]!}
          onChange={(c) => setJobs((all) => ({ ...all, [e.id]: c }))}
          bullets
        />
      ))}

      {orderChanged ? (
        <section className="panel compare">
          <div className="compare-head">
            <h2>Order</h2>
            <p className="muted small">The most relevant work comes first for this job.</p>
          </div>
          <Checkbox label="Put the most relevant jobs, projects and certifications first" checked={useOrder} onChange={setUseOrder} />
          <ol className="order-list">
            {suggestedJobOrder.map((id) => <li key={id}>Job: {byId.get(id)!.role}, {byId.get(id)!.organisation}</li>)}
            {s.projects.suggested.map((id) => titles[id] ? <li key={id}>Project: {titles[id]}</li> : null)}
            {s.certifications.suggested.map((id) => titles[id] ? <li key={id}>Certification: {titles[id]}</li> : null)}
          </ol>
        </section>
      ) : null}

      <section className="panel tailor-save">
        <TextField label="Name this version" value={name} onChange={setName} maxLength={120} hint="So you can find it later, e.g. the job and company." />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="pf-actions">
          <button type="button" className="btn primary" onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save tailored version"}</button>
          <button type="button" className="btn ghost" onClick={onRestart} disabled={saving}>Change the job</button>
          <span className="muted small">Suggested by {s.model}</span>
        </div>
      </section>
    </div>
  );
}

/** One suggestion beside the original, with a choice to use it and room to edit it. */
function Compare({ title, subtitle, change, choice, onChange, single, bullets }: {
  title: string;
  subtitle?: string;
  change: { original: string; suggested: string; kept: boolean };
  choice: Choice;
  onChange: (c: Choice) => void;
  single?: boolean;
  bullets?: boolean;
}) {
  const id = useId();
  const same = change.suggested === change.original;
  return (
    <section className={`panel compare ${choice.use ? "using" : ""}`} aria-labelledby={id}>
      <div className="compare-head">
        <div>
          <h2 id={id}>{title}</h2>
          {subtitle ? <p className="muted small">{subtitle}</p> : null}
        </div>
        {!same ? <Checkbox label="Use the suggestion" checked={choice.use} onChange={(use) => onChange({ ...choice, use })} /> : null}
      </div>
      {change.kept ? <p className="kept-note">We kept your wording here. The suggestion added details that aren't in your profile.</p> : null}
      {same ? (
        <Text text={change.original || "Nothing written"} bullets={bullets} muted={!change.original} />
      ) : (
        <div className="compare-cols">
          <div className="compare-col">
            <p className="compare-label">Now</p>
            <Text text={change.original || "Nothing written"} bullets={bullets} muted={!change.original} />
          </div>
          <div className="compare-col suggested">
            <p className="compare-label">Suggested {choice.use ? "(you can edit it)" : ""}</p>
            {choice.use ? (
              single ? (
                <TextArea label={`${title}, tailored`} value={choice.text} onChange={(text) => onChange({ ...choice, text: text.replace(/\n/g, " ") })} maxLength={120} rows={2} />
              ) : (
                <TextArea label={`${title}, tailored`} value={choice.text} onChange={(text) => onChange({ ...choice, text })} maxLength={2000} rows={Math.min(12, Math.max(4, choice.text.split("\n").length + 1))} />
              )
            ) : (
              <Text text={change.suggested} bullets={bullets} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Text({ text, bullets, muted }: { text: string; bullets?: boolean; muted?: boolean }) {
  const lines = text.split("\n").filter(Boolean);
  if (bullets && lines.length > 1) return <ul className={`compare-text ${muted ? "muted" : ""}`}>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>;
  return <p className={`compare-text ${muted ? "muted" : ""}`}>{text}</p>;
}
