import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api } from "../../../lib/api";
import { TASKS_PATH, type TaskView } from "../../../lib/tasks";
import { sessionToken } from "../../../lib/session";
import { TaskBoard } from "./TaskBoard";

export const metadata: Metadata = { title: "Tasks · Velaq" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const q = await searchParams;
  const view = q.view && /^(today|upcoming|inbox|all|completed|list:[0-9a-f-]{36})$/i.test(q.view) ? q.view : "today";
  const token = await sessionToken();
  if (!token) redirect(`/sign-in?next=${TASKS_PATH}`);
  const r = await api<TaskView>("GET", `/v1/tasks?view=${encodeURIComponent(view)}`, { token }).catch(() => null);
  if (r?.status === 401) redirect(`/sign-in?next=${TASKS_PATH}`);
  // A list that was removed (or someone else's) falls back to Today.
  if (r?.status === 404) redirect(TASKS_PATH);
  if (!r || r.status !== 200) {
    return (
      <div className="page">
        <h1 className="page-title">Tasks</h1>
        <p className="form-error" role="alert">This page couldn't be loaded. Refresh in a moment.</p>
      </div>
    );
  }
  return (
    <div className="page tasks-page">
      <TaskBoard data={r.body} />
    </div>
  );
}
