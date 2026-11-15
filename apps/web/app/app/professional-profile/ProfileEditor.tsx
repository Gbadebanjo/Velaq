"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { type Basics, type Entry, type EntryKind, type Profile, type ProfileInput, dateRange, displayUrl, monthLabel, str } from "../../../lib/profile";
import { saveProfile } from "./actions";
import { Checkbox, MonthField, TextArea, TextField } from "./parts";

/*
 * The whole profile is edited as one unit and saved together with one button. Nothing is stored
 * until "Save profile"; the save bar appears as soon as anything changes, and leaving the page
 * with unsaved changes asks first.
 */

type Data = Entry["data"];
interface DraftEntry {
  /** Stable key for React; the server id when the entry is already saved. */
  key: string;
  id?: string;
  data: Data;
  open: boolean;
}
interface Draft {
  basics: Basics;
  skills: string[];
  entries: Record<EntryKind, DraftEntry[]>;
}

const KINDS: EntryKind[] = ["link", "experience", "portfolio", "education", "certification"];

const BLANK: Record<EntryKind, Data> = {
  experience: { role: "", organisation: "", location: "", start: "", end: "", current: false, description: "" },
  education: { school: "", qualification: "", field: "", start: "", end: "", current: false, description: "" },
  certification: { name: "", issuer: "", issued: "", expires: "", credentialId: "", url: "" },
  portfolio: { title: "", url: "", description: "" },
  link: { label: "", url: "" },
};

let counter = 0;
const newKey = () => `new-${++counter}`;

function toDraft(p: Profile): Draft {
  const entries = Object.fromEntries(
    KINDS.map((k) => [k, p.entries[k].map((e) => ({ key: e.id, id: e.id, data: { ...BLANK[k], ...e.data, ...webFields(e.data) }, open: false }))]),
  ) as Record<EntryKind, DraftEntry[]>;
  return { basics: { ...p.basics, website: displayUrl(p.basics.website) }, skills: [...p.skills], entries };
}

/** Shows saved web addresses without "https://", the way people type them. */
function webFields(d: Data): Data {
  return "url" in d ? { url: displayUrl(d.url) } : {};
}

/** What gets compared to decide whether anything changed (open/closed cards don't count). */
const comparable = (d: Draft) => JSON.stringify({ b: d.basics, s: d.skills, e: KINDS.map((k) => d.entries[k].map((x) => [x.id ?? null, x.data])) });

function toInput(d: Draft): ProfileInput {
  return {
    basics: d.basics,
    skills: d.skills,
    entries: Object.fromEntries(KINDS.map((k) => [k, d.entries[k].map((e) => ({ ...(e.id ? { id: e.id } : {}), data: e.data }))])) as ProfileInput["entries"],
  };
}

export function ProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => toDraft(profile));
  const [baseline, setBaseline] = useState(() => comparable(toDraft(profile)));
  const [stamp, setStamp] = useState(profile.updatedAt);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ message?: string; notice?: string; conflict?: boolean }>({});
  const [saving, start] = useTransition();
  const dirty = useMemo(() => comparable(draft) !== baseline, [draft, baseline]);

  // Ask before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Let the rest of the page (the Download button) know about unsaved changes.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-profile-dirty", dirty);
    return () => document.documentElement.removeAttribute("data-profile-dirty");
  }, [dirty]);

  const setBasics = (k: keyof Basics, v: string | boolean) => setDraft((d) => ({ ...d, basics: { ...d.basics, [k]: v } }));
  const setEntries = (kind: EntryKind, fn: (list: DraftEntry[]) => DraftEntry[]) =>
    setDraft((d) => ({ ...d, entries: { ...d.entries, [kind]: fn(d.entries[kind]) } }));

  const save = () =>
    start(async () => {
      setStatus({});
      const r = await saveProfile(toInput(draft), stamp);
      if (r.profile) {
        const fresh = toDraft(r.profile);
        setDraft(fresh);
        setBaseline(comparable(fresh));
        setStamp(r.profile.updatedAt);
        setErrors({});
        setStatus({ notice: "Profile saved." });
        router.refresh();
        return;
      }
      const fields = r.fields ?? {};
      setErrors(fields);
      setStatus({ message: r.message, conflict: r.conflict });
      // Open every entry with a problem, then bring the first problem into view.
      setDraft((d) => {
        const next = { ...d, entries: { ...d.entries } };
        for (const key of Object.keys(fields)) {
          const m = /^entries\.(\w+)\.(\d+)\./.exec(key);
          if (m && next.entries[m[1] as EntryKind]?.[Number(m[2])]) {
            next.entries[m[1] as EntryKind] = next.entries[m[1] as EntryKind].map((e, i) => (i === Number(m[2]) ? { ...e, open: true } : e));
          }
        }
        return next;
      });
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true], .form-error")?.focus?.());
      requestAnimationFrame(() => document.querySelector("[aria-invalid=true]")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    });

  const discard = () => {
    setDraft(toDraft(profile));
    setErrors({});
    setStatus({});
  };

  const err = (k: string) => errors[k];

  return (
    <form
      className="pf-editor"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Section id="summary" title="About">
        <div className="field-pair">
          <TextField label="Headline" value={draft.basics.headline} onChange={(v) => setBasics("headline", v)} maxLength={120} placeholder="e.g. Product Designer" error={err("basics.headline")} />
          <TextField label="Location" value={draft.basics.location} onChange={(v) => setBasics("location", v)} maxLength={120} placeholder="e.g. Lagos, Nigeria" error={err("basics.location")} />
        </div>
        <TextArea label="About me" value={draft.basics.about} onChange={(v) => setBasics("about", v)} maxLength={2000} rows={5} hint="A few lines on what you do and what you're good at." error={err("basics.about")} />
      </Section>

      <Section id="contact" title="Contact" hint="Your phone, website and links such as LinkedIn.">
        <div className="field-pair">
          <TextField label="Phone" type="tel" autoComplete="tel" value={draft.basics.phone} onChange={(v) => setBasics("phone", v)} maxLength={40} optional error={err("basics.phone")} />
          <TextField label="Website" inputMode="url" value={draft.basics.website} onChange={(v) => setBasics("website", v)} maxLength={300} placeholder="e.g. yourname.com" optional error={err("basics.website")} />
        </div>
        <Checkbox label={`Show my email (${profile.person.email})`} checked={draft.basics.showEmail} onChange={(v) => setBasics("showEmail", v)} />
        <h3 className="pf-subhead">Links</h3>
        <EntryList kind="link" list={draft.entries.link} set={(fn) => setEntries("link", fn)} errors={errors} />
      </Section>

      <Section id="skills" title="Skills">
        <SkillsEditor skills={draft.skills} onChange={(skills) => setDraft((d) => ({ ...d, skills }))} error={err("skills")} />
      </Section>

      <Section id="experience" title="Experience" hint="Most recent first. Use the arrows to change the order.">
        <EntryList kind="experience" list={draft.entries.experience} set={(fn) => setEntries("experience", fn)} errors={errors} />
      </Section>

      <Section id="portfolio" title="Projects" hint="Work you're proud of, with a link to see it.">
        <EntryList kind="portfolio" list={draft.entries.portfolio} set={(fn) => setEntries("portfolio", fn)} errors={errors} />
      </Section>

      <Section id="education" title="Education">
        <EntryList kind="education" list={draft.entries.education} set={(fn) => setEntries("education", fn)} errors={errors} />
      </Section>

      <Section id="certifications" title="Certifications">
        <EntryList kind="certification" list={draft.entries.certification} set={(fn) => setEntries("certification", fn)} errors={errors} />
      </Section>

      <Pinned>
      <div className={`save-bar ${dirty || status.message || status.notice ? "show" : ""}`} role="region" aria-label="Save your profile">
        <div className="save-bar-inner">
          <p className="save-bar-text" aria-live="polite">
            {status.message ? <span className="save-bar-error">{status.message}</span> : dirty ? "You have unsaved changes." : status.notice ?? ""}
          </p>
          <div className="save-bar-actions">
            {status.conflict ? (
              <button type="button" className="btn ghost" onClick={() => window.location.reload()}>Reload latest</button>
            ) : dirty ? (
              <button type="button" className="btn ghost" onClick={discard} disabled={saving}>Discard changes</button>
            ) : null}
            <button type="button" className="btn primary" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save profile"}</button>
          </div>
        </div>
      </div>
      </Pinned>
    </form>
  );
}

/**
 * Renders into <body>, so the save bar stays pinned to the bottom of the screen even inside
 * animated page content (an ancestor with a transform would otherwise carry it along).
 */
function Pinned({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(<div className="pf-pinned">{children}</div>, document.body) : null;
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="panel pf-section" aria-labelledby={`pf-${id}`}>
      <div>
        <h2 id={`pf-${id}`}>{title}</h2>
        {hint ? <p className="muted small">{hint}</p> : null}
      </div>
      <div className="pf-form">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Skills

function SkillsEditor({ skills, onChange, error }: { skills: string[]; onChange: (s: string[]) => void; error?: string }) {
  const [typing, setTyping] = useState("");
  const add = (raw: string) => {
    const next = [...skills];
    for (const part of raw.split(",").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)) {
      if (!next.some((s) => s.toLocaleLowerCase() === part.toLocaleLowerCase()) && next.length < 50) next.push(part.slice(0, 60));
    }
    onChange(next);
    setTyping("");
  };
  return (
    <>
      {skills.length ? (
        <ul className="chips" aria-label="Your skills">
          {skills.map((s) => (
            <li key={s} className="chip">
              {s}
              <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(skills.filter((x) => x !== s))}>×</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No skills yet.</p>}
      <div className="skill-add">
        <TextField
          label="Add a skill"
          value={typing}
          maxLength={200}
          hint="Press Enter after each one, or separate them with commas."
          onChange={(v) => (v.endsWith(",") ? add(v) : setTyping(v))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // add the skill, don't submit the whole profile
              add(typing);
            } else if (e.key === "Backspace" && !typing && skills.length) onChange(skills.slice(0, -1));
          }}
          onBlur={() => typing.trim() && add(typing)}
          error={error}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Repeating entries

interface KindConfig {
  noun: string;
  title: (d: Data) => string;
  subtitle: (d: Data) => string;
  when: (d: Data) => string;
  Fields: (p: { d: Data; set: (k: string, v: string | boolean) => void; e: (k: string) => string | undefined }) => React.ReactNode;
}

const CONFIG: Record<EntryKind, KindConfig> = {
  experience: {
    noun: "job",
    title: (d) => str(d.role) || "New job",
    subtitle: (d) => [str(d.organisation), str(d.location)].filter(Boolean).join(" · "),
    when: (d) => dateRange(d.start, d.end, d.current === true),
    Fields: ({ d, set, e }) => (
      <>
        <div className="field-pair">
          <TextField label="Role" value={str(d.role)} onChange={(v) => set("role", v)} maxLength={120} required error={e("role")} />
          <TextField label="Organisation" value={str(d.organisation)} onChange={(v) => set("organisation", v)} maxLength={120} required error={e("organisation")} />
        </div>
        <TextField label="Location" value={str(d.location)} onChange={(v) => set("location", v)} maxLength={120} optional error={e("location")} />
        <div className="field-pair">
          <MonthField label="Started" value={str(d.start)} onChange={(v) => set("start", v)} error={e("start")} />
          <MonthField label="Finished" value={str(d.end)} onChange={(v) => set("end", v)} error={e("end")} disabled={d.current === true} />
        </div>
        <Checkbox label="I work here now" checked={d.current === true} onChange={(v) => set("current", v)} />
        <TextArea label="What you did" value={str(d.description)} onChange={(v) => set("description", v)} maxLength={2000} optional error={e("description")} hint="Results and responsibilities. Each new line becomes a bullet point." />
      </>
    ),
  },
  education: {
    noun: "education",
    title: (d) => str(d.school) || "New education",
    subtitle: (d) => [str(d.qualification), str(d.field)].filter(Boolean).join(", "),
    when: (d) => dateRange(d.start, d.end, d.current === true),
    Fields: ({ d, set, e }) => (
      <>
        <TextField label="School" value={str(d.school)} onChange={(v) => set("school", v)} maxLength={120} required error={e("school")} />
        <div className="field-pair">
          <TextField label="Qualification" value={str(d.qualification)} onChange={(v) => set("qualification", v)} maxLength={120} placeholder="e.g. BSc" optional error={e("qualification")} />
          <TextField label="Field of study" value={str(d.field)} onChange={(v) => set("field", v)} maxLength={120} optional error={e("field")} />
        </div>
        <div className="field-pair">
          <MonthField label="Started" value={str(d.start)} onChange={(v) => set("start", v)} optional error={e("start")} />
          <MonthField label="Finished" value={str(d.end)} onChange={(v) => set("end", v)} optional error={e("end")} disabled={d.current === true} />
        </div>
        <Checkbox label="I'm studying here now" checked={d.current === true} onChange={(v) => set("current", v)} />
        <TextArea label="Details" value={str(d.description)} onChange={(v) => set("description", v)} maxLength={1000} rows={3} optional error={e("description")} />
      </>
    ),
  },
  certification: {
    noun: "certification",
    title: (d) => str(d.name) || "New certification",
    subtitle: (d) => [str(d.issuer), str(d.credentialId) && `Credential ${str(d.credentialId)}`].filter(Boolean).join(" · "),
    when: (d) => [monthLabel(d.issued) && `Issued ${monthLabel(d.issued)}`, monthLabel(d.expires) && `Expires ${monthLabel(d.expires)}`].filter(Boolean).join(" · "),
    Fields: ({ d, set, e }) => (
      <>
        <div className="field-pair">
          <TextField label="Certification" value={str(d.name)} onChange={(v) => set("name", v)} maxLength={120} required error={e("name")} />
          <TextField label="Issued by" value={str(d.issuer)} onChange={(v) => set("issuer", v)} maxLength={120} optional error={e("issuer")} />
        </div>
        <div className="field-pair">
          <MonthField label="Issued" value={str(d.issued)} onChange={(v) => set("issued", v)} optional error={e("issued")} />
          <MonthField label="Expires" value={str(d.expires)} onChange={(v) => set("expires", v)} optional error={e("expires")} />
        </div>
        <div className="field-pair">
          <TextField label="Credential ID" value={str(d.credentialId)} onChange={(v) => set("credentialId", v)} maxLength={120} optional error={e("credentialId")} />
          <TextField label="Link to check it" inputMode="url" value={str(d.url)} onChange={(v) => set("url", v)} maxLength={300} optional error={e("url")} />
        </div>
      </>
    ),
  },
  portfolio: {
    noun: "project",
    title: (d) => str(d.title) || "New project",
    subtitle: (d) => displayUrl(d.url),
    when: () => "",
    Fields: ({ d, set, e }) => (
      <>
        <div className="field-pair">
          <TextField label="Project name" value={str(d.title)} onChange={(v) => set("title", v)} maxLength={120} required error={e("title")} />
          <TextField label="Link" inputMode="url" value={str(d.url)} onChange={(v) => set("url", v)} maxLength={300} required placeholder="e.g. behance.net/you/project" error={e("url")} />
        </div>
        <TextArea label="Description" value={str(d.description)} onChange={(v) => set("description", v)} maxLength={500} rows={3} optional error={e("description")} />
      </>
    ),
  },
  link: {
    noun: "link",
    title: (d) => str(d.label) || "New link",
    subtitle: (d) => displayUrl(d.url),
    when: () => "",
    Fields: ({ d, set, e }) => (
      <div className="field-pair">
        <TextField label="Label" value={str(d.label)} onChange={(v) => set("label", v)} maxLength={60} required placeholder="e.g. LinkedIn" error={e("label")} />
        <TextField label="Link" inputMode="url" value={str(d.url)} onChange={(v) => set("url", v)} maxLength={300} required placeholder="e.g. linkedin.com/in/you" error={e("url")} />
      </div>
    ),
  },
};

function EntryList({ kind, list, set, errors }: {
  kind: EntryKind;
  list: DraftEntry[];
  set: (fn: (list: DraftEntry[]) => DraftEntry[]) => void;
  errors: Record<string, string>;
}) {
  const cfg = CONFIG[kind];
  const addRef = useRef<HTMLButtonElement>(null);
  const update = (key: string, fn: (e: DraftEntry) => DraftEntry) => set((l) => l.map((e) => (e.key === key ? fn(e) : e)));
  const move = (i: number, by: -1 | 1) =>
    set((l) => {
      const next = [...l];
      const [moved] = next.splice(i, 1);
      next.splice(i + by, 0, moved!);
      return next;
    });

  return (
    <div className="entries">
      {list.length ? (
        <ol className="entry-list">
          {list.map((e, i) => {
            const prefix = `entries.${kind}.${i}.`;
            const problem = Object.keys(errors).some((k) => k.startsWith(prefix));
            return (
              <li key={e.key} className={`entry ${e.open ? "editing" : ""} ${problem ? "has-error" : ""}`}>
                <div className="entry-row">
                  <div className="entry-main">
                    <div className="entry-head">
                      <p className="entry-title">{cfg.title(e.data)}</p>
                      {cfg.when(e.data) ? <p className="entry-when">{cfg.when(e.data)}</p> : null}
                    </div>
                    {cfg.subtitle(e.data) ? <p className="entry-sub">{cfg.subtitle(e.data)}</p> : null}
                    {problem && !e.open ? <p className="field-error">This needs fixing. Open it to see what.</p> : null}
                  </div>
                  <div className="entry-actions">
                    {list.length > 1 ? (
                      <>
                        <button type="button" className="icon-btn" aria-label={`Move ${cfg.title(e.data)} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                        <button type="button" className="icon-btn" aria-label={`Move ${cfg.title(e.data)} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                      </>
                    ) : null}
                    <button type="button" className="text-btn" aria-expanded={e.open} onClick={() => update(e.key, (x) => ({ ...x, open: !x.open }))}>
                      {e.open ? "Done" : "Edit"}
                    </button>
                    <button type="button" className="text-btn danger" onClick={() => { set((l) => l.filter((x) => x.key !== e.key)); addRef.current?.focus(); }}>
                      Remove
                    </button>
                  </div>
                </div>
                {e.open ? (
                  <div className="entry-fields">
                    <cfg.Fields d={e.data} set={(k, v) => update(e.key, (x) => ({ ...x, data: { ...x.data, [k]: v } }))} e={(k) => errors[prefix + k]} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="muted">Nothing added yet.</p>}
      {errors[`entries.${kind}`] ? <p className="field-error">{errors[`entries.${kind}`]}</p> : null}
      <div>
        <button ref={addRef} type="button" className="btn ghost" onClick={() => set((l) => [...l, { key: newKey(), data: { ...BLANK[kind] }, open: true }])}>
          + Add {cfg.noun}
        </button>
      </div>
    </div>
  );
}
