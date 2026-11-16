/** Tasks (PER-030): shared types and date words for the Tasks page. */
export const TASKS_PATH = "/app/tasks";

export type Repeat = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";
export interface Task {
  id: string;
  listId: string | null;
  title: string;
  notes: string;
  dueDate: string | null;
  priority: number;
  repeat: Repeat | null;
  goalId: string | null;
  goalName: string | null;
  completedAt: string | null;
  createdAt: string;
}
export interface TaskList {
  id: string;
  name: string;
  open: number;
}
export interface TaskView {
  today: string;
  view: string;
  tasks: Task[];
  lists: TaskList[];
  counts: { today: number; upcoming: number; inbox: number; overdue: number };
  goals: { id: string; name: string }[];
}

export const REPEATS: { id: Repeat; name: string; short: string }[] = [
  { id: "daily", name: "Every day", short: "Daily" },
  { id: "weekdays", name: "Every weekday", short: "Weekdays" },
  { id: "weekly", name: "Every week", short: "Weekly" },
  { id: "monthly", name: "Every month", short: "Monthly" },
  { id: "yearly", name: "Every year", short: "Yearly" },
];
export const PRIORITIES = ["None", "Low", "Medium", "High"] as const;

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** "Today", "Tomorrow", "Yesterday", "3 days late", "Wed 18 Nov" (with the year when it isn't this year). */
export function dueWords(due: string, today: string): { text: string; late: boolean; soon: boolean } {
  const n = daysBetween(today, due);
  if (n === 0) return { text: "Today", late: false, soon: true };
  if (n === 1) return { text: "Tomorrow", late: false, soon: true };
  if (n === -1) return { text: "Yesterday", late: true, soon: false };
  if (n < 0) return { text: `${-n} days late`, late: true, soon: false };
  const sameYear = due.slice(0, 4) === today.slice(0, 4);
  const text = new Intl.DateTimeFormat("en-GB", { weekday: n < 7 ? "long" : "short", day: n < 7 ? undefined : "numeric", month: n < 7 ? undefined : "short", year: sameYear ? undefined : "numeric", timeZone: "UTC" }).format(new Date(`${due}T00:00:00Z`));
  return { text, late: false, soon: false };
}

export const longDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
