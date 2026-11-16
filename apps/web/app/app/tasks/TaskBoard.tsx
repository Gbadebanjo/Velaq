"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { PRIORITIES, REPEATS, TASKS_PATH, type Task, type TaskView, addDays, dueWords, longDate } from "../../../lib/tasks";
import { taskCall } from "./actions";

type Toast = { text: string; undo?: () => void } | null;

const href = (view: string) => (view === "today" ? TASKS_PATH : `${TASKS_PATH}?view=${view}`);

export function TaskBoard({ data }: { data: TaskView }) {
  const router = useRouter();
  const { view, today, lists, counts } = data;
  const list = view.startsWith("list:") ? lists.find((l) => `list:${l.id}` === view) : undefined;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fresh data from the server replaces anything hidden or ticked on this screen.
  useEffect(() => {
    setHidden(new Set());
    setTicked(new Set());
    // A deleted task's row is gone once the new data arrives; keep focus on the page, not lost at the top.
    if (!editing && opener.current && !opener.current.isConnected) {
      document.getElementById("tasks-title")?.focus();
      opener.current = null;
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (t: Toast) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  const title = view === "today" ? "Today" : view === "upcoming" ? "Upcoming" : view === "inbox" ? "Inbox" : view === "completed" ? "Completed" : view === "all" ? "All tasks" : list?.name ?? "List";
  const visible = data.tasks.filter((t) => !hidden.has(t.id));
  const groups = useMemo(() => group(visible, view, today), [visible, view, today]);

  const toggle = async (t: Task) => {
    const done = !t.completedAt;
    setTicked((s) => new Set(s).add(t.id));
    // Let the tick show for a moment before the row leaves the list.
    setTimeout(() => setHidden((s) => new Set(s).add(t.id)), done ? 650 : 250);
    const r = await taskCall<{ next: Task | null }>("POST", `/v1/tasks/${t.id}/complete`, { done });
    if (!r.ok) {
      setTicked((s) => withOut(s, t.id));
      setHidden((s) => withOut(s, t.id));
      return say({ text: r.message ?? "That didn't save." });
    }
    const undo = async () => {
      setToast(null);
      await taskCall("POST", `/v1/tasks/${t.id}/complete`, { done: !done });
      router.refresh();
    };
    if (!done) return say({ text: `Back on your list: ${t.title}` });
    const next = r.ok.next?.dueDate ? ` Next one: ${dueWords(r.ok.next.dueDate, today).text}.` : "";
    say({ text: `Done: ${t.title}.${next}`, undo });
  };

  return (
    <div className="tasks">
      <nav className="tasks-nav" aria-label="Task views">
        <ViewLink view="today" current={view} label="Today" count={counts.today} warn={counts.overdue > 0} icon="sun" />
        <ViewLink view="upcoming" current={view} label="Upcoming" count={counts.upcoming} icon="cal" />
        <ViewLink view="inbox" current={view} label="Inbox" count={counts.inbox} icon="inbox" />
        <ViewLink view="completed" current={view} label="Completed" icon="check" />
        <p className="tasks-nav-head">Lists</p>
        {lists.map((l) => <ViewLink key={l.id} view={`list:${l.id}`} current={view} label={l.name} count={l.open} icon="dot" />)}
        <NewList />
      </nav>

      <section className="tasks-main" aria-labelledby="tasks-title">
        <header className="tasks-head">
          <div>
            <h1 id="tasks-title" className="page-title" tabIndex={-1}>{title}</h1>
            <p className="muted">
              {view === "today" ? longDate(today) : view === "completed" ? "Done in the last 30 days" : `${visible.length} ${visible.length === 1 ? "task" : "tasks"}`}
              {view === "today" && counts.overdue ? <span className="tasks-late"> · {counts.overdue} running late</span> : null}
            </p>
          </div>
          {list ? <ListActions list={list} /> : null}
        </header>

        {view !== "completed" ? <QuickAdd view={view} today={today} listId={list?.id ?? null} /> : null}

        {groups.length ? (
          groups.map((g) => (
            <div key={g.title ?? "all"} className="task-group">
              {g.title ? <h2 className={`task-group-title${g.late ? " late" : ""}`}>{g.title}</h2> : null}
              <ul className="task-list">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    ticked={ticked.has(t.id)}
                    leaving={ticked.has(t.id)}
                    showList={!list && view !== "inbox" ? lists.find((l) => l.id === t.listId)?.name : undefined}
                    onToggle={() => toggle(t)}
                    onOpen={(el) => {
                      opener.current = el;
                      setEditing(t);
                    }}
                  />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <Empty view={view} />
        )}
      </section>

      {toast ? (
        <div className="task-toast" role="status">
          <span>{toast.text}</span>
          {toast.undo ? <button type="button" className="task-toast-undo" onClick={toast.undo}>Undo</button> : null}
        </div>
      ) : null}

      {editing ? (
        <TaskDialog
          task={editing}
          data={data}
          onClose={() => {
            setEditing(null);
            const back = opener.current;
            requestAnimationFrame(() => back?.isConnected && back.focus());
          }}
        />
      ) : null}
    </div>
  );
}

const withOut = (s: Set<string>, id: string) => {
  const n = new Set(s);
  n.delete(id);
  return n;
};

/** Today splits into "Running late" and "Today"; Upcoming is grouped by day; other views are one list. */
function group(tasks: Task[], view: string, today: string): { title?: string; late?: boolean; tasks: Task[] }[] {
  if (!tasks.length) return [];
  if (view === "today") {
    const late = tasks.filter((t) => t.dueDate! < today);
    const now = tasks.filter((t) => t.dueDate! >= today);
    return [...(late.length ? [{ title: "Running late", late: true, tasks: late }] : []), ...(now.length ? [{ title: late.length ? "Today" : undefined, tasks: now }] : [])];
  }
  if (view === "upcoming") {
    const by = new Map<string, Task[]>();
    for (const t of tasks) by.set(t.dueDate!, [...(by.get(t.dueDate!) ?? []), t]);
    return [...by.entries()].map(([d, ts]) => ({ title: d === addDays(today, 1) ? "Tomorrow" : longDate(d), tasks: ts }));
  }
  return [{ tasks }];
}

// ---- Pieces ---------------------------------------------------------------------------------------

const NAV_ICONS: Record<string, React.ReactNode> = {
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  inbox: (<><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6Z" /></>),
  check: (<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>),
  dot: <circle cx="12" cy="12" r="4" />,
};

function ViewLink({ view, current, label, count, warn, icon }: { view: string; current: string; label: string; count?: number; warn?: boolean; icon: string }) {
  const on = view === current;
  return (
    <Link href={href(view)} className={`tasks-view${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{NAV_ICONS[icon]}</svg>
      <span className="tasks-view-name">{label}</span>
      {count ? <span className={`tasks-count${warn ? " warn" : ""}`}>{count}</span> : null}
    </Link>
  );
}

function TaskRow({ task: t, today, ticked, leaving, showList, onToggle, onOpen }: { task: Task; today: string; ticked: boolean; leaving: boolean; showList?: string; onToggle: () => void; onOpen: (el: HTMLElement) => void }) {
  const done = !!t.completedAt !== ticked;
  const due = t.dueDate ? dueWords(t.dueDate, today) : null;
  return (
    <li className={`task${done ? " done" : ""}${leaving ? " leaving" : ""} p${t.priority}`}>
      <button type="button" className="task-check" role="checkbox" aria-checked={done} aria-label={done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`} onClick={onToggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.5 3.5 7.5-8" /></svg>
      </button>
      <button type="button" className="task-body" onClick={(e) => onOpen(e.currentTarget)} aria-label={`Open "${t.title}"`}>
        <span className="task-title">{t.title}</span>
        {due || t.repeat || t.priority || showList || t.goalName || t.notes ? (
          <span className="task-meta">
            {due ? <span className={`task-due${due.late ? " late" : ""}${due.soon ? " soon" : ""}`}>{due.text}</span> : null}
            {t.repeat ? <span className="task-chip" title={REPEATS.find((r) => r.id === t.repeat)?.name}>↻ {REPEATS.find((r) => r.id === t.repeat)?.short}</span> : null}
            {t.priority ? <span className={`task-flag p${t.priority}`}>{PRIORITIES[t.priority]}</span> : null}
            {showList ? <span className="task-chip">{showList}</span> : null}
            {t.goalName ? <span className="task-chip goal">For {t.goalName}</span> : null}
            {t.notes ? <span className="task-chip" aria-label="Has notes">Notes</span> : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function QuickAdd({ view, today, listId }: { view: string; today: string; listId: string | null }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, start] = useTransition();
  // New tasks land where the person is looking: due today in Today, tomorrow in Upcoming, in the open list.
  const due = view === "today" ? today : view === "upcoming" ? addDays(today, 1) : null;
  const where = view === "today" ? "due today" : view === "upcoming" ? "due tomorrow" : listId ? "to this list" : "to your Inbox";
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        start(async () => {
          const r = await taskCall("POST", "/v1/tasks", { title, dueDate: due, listId });
          if (!r.ok) return setMessage(r.fields?.title ?? r.message ?? "That didn't save.");
          setTitle("");
          setMessage("");
          input.current?.focus();
        });
      }}
    >
      <label htmlFor={`${id}-t`} className="sr-only">New task</label>
      <span className="quick-add-plus" aria-hidden="true">+</span>
      {/* Read-only (not disabled) while saving, so the cursor stays here for the next task. */}
      <input id={`${id}-t`} ref={input} value={title} maxLength={200} placeholder="Add a task" autoComplete="off" onChange={(e) => setTitle(e.target.value)} readOnly={busy} aria-busy={busy} aria-describedby={`${id}-h`} />
      <span id={`${id}-h`} className="quick-add-hint">{title ? `Enter to add ${where}` : ""}</span>
      {message ? <p className="field-error" role="alert">{message}</p> : null}
    </form>
  );
}

function Empty({ view }: { view: string }) {
  const [head, line] =
    view === "today" ? ["Nothing due today", "Add something above, or enjoy the free time."]
    : view === "upcoming" ? ["Nothing coming up", "Tasks with a date after today show here."]
    : view === "completed" ? ["Nothing finished yet", "Ticked-off tasks from the last 30 days show here, in case you need one back."]
    : ["All clear", "Add a task above."];
  return (
    <div className="tasks-empty">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
      <p className="tasks-empty-head">{head}</p>
      <p className="muted">{line}</p>
    </div>
  );
}

function NewList() {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  if (!open) return <button type="button" className="tasks-view add" onClick={() => setOpen(true)}>+ New list</button>;
  return (
    <form
      className="tasks-newlist"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await taskCall<{ id: string }>("POST", "/v1/tasks/lists", { name });
          if (!r.ok) return setError(r.fields?.name ?? r.message ?? "That didn't save.");
          setOpen(false);
          setName("");
          setError("");
          router.push(href(`list:${r.ok.id}`));
        });
      }}
    >
      <label htmlFor={`${id}-n`} className="sr-only">List name</label>
      <input id={`${id}-n`} value={name} maxLength={40} placeholder="List name" autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} aria-invalid={error ? true : undefined} />
      <button type="submit" className="btn primary sm" disabled={busy || !name.trim()}>Add</button>
      {error ? <p className="field-error">{error}</p> : null}
    </form>
  );
}

function ListActions({ list }: { list: { id: string; name: string; open: number } }) {
  const router = useRouter();
  const id = useId();
  const [mode, setMode] = useState<"idle" | "rename" | "remove">("idle");
  const [name, setName] = useState(list.name);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  if (mode === "rename")
    return (
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await taskCall("PATCH", `/v1/tasks/lists/${list.id}`, { name });
            if (!r.ok) return setError(r.fields?.name ?? r.message ?? "That didn't save.");
            setMode("idle");
          });
        }}
      >
        <label htmlFor={`${id}-r`} className="sr-only">New name for {list.name}</label>
        <input id={`${id}-r`} value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} />
        <button type="submit" className="btn primary sm" disabled={busy}>Save</button>
        <button type="button" className="btn ghost sm" onClick={() => setMode("idle")}>Cancel</button>
        {error ? <p className="field-error">{error}</p> : null}
      </form>
    );
  if (mode === "remove")
    return (
      <div className="entry-actions confirm">
        <span>Remove this list?{list.open ? ` Its ${list.open} ${list.open === 1 ? "task moves" : "tasks move"} to the Inbox.` : ""}</span>
        <button type="button" className="btn danger sm" disabled={busy} onClick={() => start(async () => { const r = await taskCall("DELETE", `/v1/tasks/lists/${list.id}`); if (r.ok) router.push(href("inbox")); else setError(r.message ?? ""); })}>Remove</button>
        <button type="button" className="btn ghost sm" onClick={() => setMode("idle")}>Keep</button>
      </div>
    );
  return (
    <div className="row-actions">
      <button type="button" className="text-btn" onClick={() => setMode("rename")}>Rename</button>
      <button type="button" className="text-btn danger" onClick={() => setMode("remove")}>Remove list</button>
    </div>
  );
}

// ---- Edit window ----------------------------------------------------------------------------------

function TaskDialog({ task, data, onClose }: { task: Task; data: TaskView; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [f, setF] = useState({
    title: task.title,
    notes: task.notes,
    dueDate: task.dueDate ?? "",
    priority: task.priority,
    repeat: task.repeat ?? "",
    listId: task.listId ?? "",
    goalId: task.goalId ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const today = data.today;

  useEffect(() => {
    dialog.current?.showModal();
    document.documentElement.classList.add("modal-open");
    return () => document.documentElement.classList.remove("modal-open");
  }, []);

  const save = () =>
    start(async () => {
      const r = await taskCall("PATCH", `/v1/tasks/${task.id}`, {
        title: f.title,
        notes: f.notes,
        dueDate: f.dueDate || null,
        priority: f.priority,
        repeat: f.repeat || null,
        listId: f.listId || null,
        goalId: f.goalId || null,
      });
      if (r.ok) return onClose();
      setErrors(r.fields ?? {});
      setMessage(r.fields ? "" : r.message ?? "");
    });

  const field = (k: string, label: string, input: React.ReactNode) => (
    <div className="field">
      <label htmlFor={`${id}-${k}`}>{label}</label>
      {input}
      {errors[k] ? <p className="field-error">{errors[k]}</p> : null}
    </div>
  );
  const quick: [string, string | ""][] = [["Today", today], ["Tomorrow", addDays(today, 1)], ["Next week", addDays(today, 7)], ["No date", ""]];

  return (
    <dialog ref={dialog} className="cv-modal entry-modal" aria-labelledby={`${id}-h`} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="cv-modal-box entry-box" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <header className="cv-modal-head">
          <h2 id={`${id}-h`}>Edit task</h2>
          <button type="button" className="icon-btn cv-modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="entry-body">
          {field("title", "Task", <input id={`${id}-title`} value={f.title} maxLength={200} onChange={(e) => set("title", e.target.value)} aria-invalid={errors.title ? true : undefined} />)}
          <div className="field">
            <label htmlFor={`${id}-dueDate`}>Due</label>
            <div className="due-quick" role="group" aria-label="Quick dates">
              {quick.map(([label, d]) => (
                <button key={label} type="button" className={`chip-btn${f.dueDate === d ? " on" : ""}`} aria-pressed={f.dueDate === d} onClick={() => set("dueDate", d)}>{label}</button>
              ))}
            </div>
            <input id={`${id}-dueDate`} type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} aria-invalid={errors.dueDate ? true : undefined} />
            {errors.dueDate ? <p className="field-error">{errors.dueDate}</p> : null}
          </div>
          <div className="field">
            <span className="field-label" id={`${id}-pl`}>Priority</span>
            <div className="seg prio-seg" role="radiogroup" aria-labelledby={`${id}-pl`}>
              {PRIORITIES.map((p, i) => (
                <button key={p} type="button" role="radio" aria-checked={f.priority === i} className={`${f.priority === i ? "on" : ""} p${i}`} onClick={() => set("priority", i)}>{p}</button>
              ))}
            </div>
          </div>
          <div className="field-pair">
            {field("repeat", "Repeat",
              <select id={`${id}-repeat`} value={f.repeat} onChange={(e) => set("repeat", e.target.value as typeof f.repeat)}>
                <option value="">Doesn't repeat</option>
                {REPEATS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>)}
            {field("listId", "List",
              <select id={`${id}-listId`} value={f.listId} onChange={(e) => set("listId", e.target.value)}>
                <option value="">Inbox</option>
                {data.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>)}
          </div>
          {data.goals.length || task.goalId ? field("goalId", "For a savings goal (optional)",
            <select id={`${id}-goalId`} value={f.goalId} onChange={(e) => set("goalId", e.target.value)}>
              <option value="">None</option>
              {data.goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              {task.goalId && !data.goals.some((g) => g.id === task.goalId) ? <option value={task.goalId}>{task.goalName ?? "Archived goal"}</option> : null}
            </select>) : null}
          {field("notes", "Notes", <textarea id={`${id}-notes`} rows={4} maxLength={2000} value={f.notes} onChange={(e) => set("notes", e.target.value)} />)}
          {f.repeat ? <p className="field-hint">When you tick it off, the next one is added {REPEATS.find((r) => r.id === f.repeat)?.name.toLowerCase()} from its due date.</p> : null}
          {message ? <p className="form-error" role="alert">{message}</p> : null}
        </div>
        <footer className="cv-modal-foot entry-foot">
          {confirmDelete ? (
            <span className="entry-actions confirm"><span>Delete this task?</span>
              <button type="button" className="btn danger sm" disabled={busy} onClick={() => start(async () => { const r = await taskCall("DELETE", `/v1/tasks/${task.id}`); if (r.ok) onClose(); else setMessage(r.message ?? ""); })}>Delete</button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          ) : <button type="button" className="text-btn danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </footer>
      </form>
    </dialog>
  );
}
