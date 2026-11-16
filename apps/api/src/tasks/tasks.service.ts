/**
 * PER-030 Tasks: personal to-dos with lists, due dates, priorities and repeats.
 *
 * Tasks without a list are in the Inbox. "Today" is today in Lagos, so a task due today doesn't turn
 * overdue at 11pm because a server runs on UTC. A repeating task, once done, makes its next
 * occurrence; undoing the tick takes that occurrence away again if it hasn't been touched.
 */
import { Inject, Injectable } from "@nestjs/common";
import { type Queryable, type TxRunner, withSpace } from "@velaq/db";
import { uuidv7 } from "../identity/uuid.js";
import { PERSONAL_DB } from "../space/space.service.js";
import type { ListInput, TaskInput, TaskPatch } from "./tasks.schemas.js";

export const TASKS = "PER-030";
const MAX_LISTS = 30;
const MAX_OPEN = 1000;
const COMPLETED_DAYS = 30;

export type Repeat = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";
export type View = "today" | "upcoming" | "inbox" | "all" | "completed" | `list:${string}`;

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

export class TaskError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

/** The next due date for a repeating task, counted from its due date (or today if it had none). */
export function nextDue(due: string | null, repeat: Repeat, today = lagosToday()): string {
  const d = new Date(`${due ?? today}T00:00:00Z`);
  const day = d.getUTCDate();
  const addMonths = (n: number) => {
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    // The 31st becomes the last day of a shorter month, and 29 February the 28th in other years.
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  };
  if (repeat === "daily") d.setUTCDate(day + 1);
  else if (repeat === "weekly") d.setUTCDate(day + 7);
  else if (repeat === "monthly") addMonths(1);
  else if (repeat === "yearly") addMonths(12);
  else {
    do d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  }
  return d.toISOString().slice(0, 10);
}

interface Row {
  id: string;
  list_id: string | null;
  title: string;
  notes: string;
  due_date: string | Date | null;
  priority: number;
  repeat: Repeat | null;
  goal_id: string | null;
  goal_name: string | null;
  completed_at: Date | null;
  created_at: Date;
}
const SELECT = `SELECT t.id, t.list_id, t.title, t.notes, t.due_date, t.priority, t.repeat, t.goal_id, g.name AS goal_name, t.completed_at, t.created_at
  FROM tasks t LEFT JOIN money_goals g ON g.id = t.goal_id`;
const task = (r: Row): Task => ({
  id: r.id,
  listId: r.list_id,
  title: r.title,
  notes: r.notes,
  // The live database returns dates as "YYYY-MM-DD"; the test database returns Date objects at UTC midnight.
  dueDate: r.due_date === null ? null : typeof r.due_date === "string" ? r.due_date : r.due_date.toISOString().slice(0, 10),
  priority: r.priority,
  repeat: r.repeat,
  goalId: r.goal_id,
  goalName: r.goal_name,
  completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
});

@Injectable()
export class TaskService {
  constructor(@Inject(PERSONAL_DB) private readonly db: TxRunner) {}

  /** One view's tasks, plus what the side menu needs: the lists and the counts. */
  async view(spaceId: string, view: View) {
    const today = lagosToday();
    return withSpace(this.db, spaceId, async (tx) => {
      const open = "NOT t.deleted AND t.completed_at IS NULL";
      const order = "t.due_date NULLS LAST, t.priority DESC, t.created_at";
      let where: string;
      let params: unknown[] = [];
      let sort = order;
      if (view === "today") {
        where = `${open} AND t.due_date <= $1`;
        params = [today];
      } else if (view === "upcoming") {
        where = `${open} AND t.due_date > $1`;
        params = [today];
      }
      else if (view === "inbox") where = `${open} AND t.list_id IS NULL`;
      else if (view === "all") where = open;
      else if (view === "completed") {
        where = "NOT t.deleted AND t.completed_at > now() - make_interval(days => $1)";
        params = [COMPLETED_DAYS];
        sort = "t.completed_at DESC";
      } else {
        const listId = view.slice(5);
        if (!(await tx.query("SELECT 1 FROM task_lists WHERE id = $1", [listId])).rows.length) throw new TaskError(404, "That list doesn't exist.");
        where = `${open} AND t.list_id = $1`;
        params = [listId];
      }
      const rows = (await tx.query<Row>(`${SELECT} WHERE ${where} ORDER BY ${sort} LIMIT 500`, params)).rows;
      const lists = (await tx.query<{ id: string; name: string; open: number }>(
        `SELECT l.id, l.name, count(t.id) FILTER (WHERE NOT t.deleted AND t.completed_at IS NULL)::int AS open
           FROM task_lists l LEFT JOIN tasks t ON t.list_id = l.id GROUP BY l.id ORDER BY l.position, l.created_at`,
      )).rows;
      const counts = (await tx.query<{ today: number; upcoming: number; inbox: number; overdue: number }>(
        `SELECT count(*) FILTER (WHERE due_date <= $1)::int AS today, count(*) FILTER (WHERE due_date > $1)::int AS upcoming,
                count(*) FILTER (WHERE list_id IS NULL)::int AS inbox, count(*) FILTER (WHERE due_date < $1)::int AS overdue
           FROM tasks WHERE NOT deleted AND completed_at IS NULL`,
        [today],
      )).rows[0]!;
      const goals = (await tx.query<{ id: string; name: string }>("SELECT id, name FROM money_goals WHERE NOT archived ORDER BY position, created_at")).rows;
      return { today, view, tasks: rows.map(task), lists, counts, goals };
    });
  }

  async create(spaceId: string, t: TaskInput) {
    return withSpace(this.db, spaceId, async (tx) => {
      const n = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM tasks WHERE NOT deleted AND completed_at IS NULL")).rows[0]!.n;
      if (n >= MAX_OPEN) throw new TaskError(409, `You have ${MAX_OPEN} open tasks. Finish or delete some first.`);
      await this.checkLinks(tx, t.listId, t.goalId);
      const id = uuidv7();
      // A repeat needs a date to count from.
      const due = t.repeat && !t.dueDate ? lagosToday() : t.dueDate;
      await tx.query(
        "INSERT INTO tasks (id, list_id, title, notes, due_date, priority, repeat, goal_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [id, t.listId, t.title, t.notes, due, t.priority, t.repeat, t.goalId],
      );
      return this.one(tx, id);
    });
  }

  async update(spaceId: string, id: string, p: TaskPatch) {
    return withSpace(this.db, spaceId, async (tx) => {
      const cur = await this.one(tx, id);
      await this.checkLinks(tx, p.listId, p.goalId);
      const repeat = p.repeat !== undefined ? p.repeat : cur.repeat;
      let due = p.dueDate !== undefined ? p.dueDate : cur.dueDate;
      if (repeat && !due) due = lagosToday();
      await tx.query(
        `UPDATE tasks SET title = $2, notes = $3, due_date = $4, priority = $5, repeat = $6, list_id = $7, goal_id = $8, updated_at = now() WHERE id = $1`,
        [id, p.title ?? cur.title, p.notes ?? cur.notes, due, p.priority ?? cur.priority, repeat,
         p.listId !== undefined ? p.listId : cur.listId, p.goalId !== undefined ? p.goalId : cur.goalId],
      );
      return this.one(tx, id);
    });
  }

  /** Ticks a task off, or un-ticks it. Returns the task, and the next one if a repeat made it. */
  async complete(spaceId: string, id: string, done: boolean) {
    return withSpace(this.db, spaceId, async (tx) => {
      const cur = await this.one(tx, id);
      if (done === !!cur.completedAt) return { task: cur, next: null };
      if (done) {
        await tx.query("UPDATE tasks SET completed_at = now(), updated_at = now() WHERE id = $1", [id]);
        let next: Task | null = null;
        if (cur.repeat) {
          const nid = uuidv7();
          await tx.query(
            `INSERT INTO tasks (id, list_id, title, notes, due_date, priority, repeat, goal_id, repeat_of)
             SELECT $2, list_id, title, notes, $3, priority, repeat, goal_id, id FROM tasks WHERE id = $1`,
            [id, nid, nextDue(cur.dueDate, cur.repeat)],
          );
          next = await this.one(tx, nid);
        }
        return { task: await this.one(tx, id), next };
      }
      await tx.query("UPDATE tasks SET completed_at = NULL, updated_at = now() WHERE id = $1", [id]);
      // Take back the occurrence this tick made, unless it has been edited or ticked since.
      await tx.query(
        "UPDATE tasks SET deleted = true WHERE repeat_of = $1 AND NOT deleted AND completed_at IS NULL AND updated_at = created_at",
        [id],
      );
      return { task: await this.one(tx, id), next: null };
    });
  }

  async remove(spaceId: string, id: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      const r = await tx.query("UPDATE tasks SET deleted = true, updated_at = now() WHERE id = $1 AND NOT deleted RETURNING id", [id]);
      if (!r.rows.length) throw new TaskError(404, "That task doesn't exist.");
    });
  }

  // ---- Lists -----------------------------------------------------------------------------------

  async addList(spaceId: string, l: ListInput) {
    return withSpace(this.db, spaceId, async (tx) => {
      const names = (await tx.query<{ name: string }>("SELECT name FROM task_lists")).rows.map((r) => r.name.toLowerCase());
      if (names.length >= MAX_LISTS) throw new TaskError(409, `You can have up to ${MAX_LISTS} lists.`);
      if (names.includes(l.name.toLowerCase()) || l.name.toLowerCase() === "inbox") throw new TaskError(400, "You already have a list with that name.", "name");
      const id = uuidv7();
      await tx.query("INSERT INTO task_lists (id, name, position) VALUES ($1, $2, $3)", [id, l.name, names.length]);
      return { id, name: l.name };
    });
  }

  async renameList(spaceId: string, id: string, l: ListInput) {
    return withSpace(this.db, spaceId, async (tx) => {
      const clash = await tx.query("SELECT 1 FROM task_lists WHERE lower(name) = lower($1) AND id <> $2", [l.name, id]);
      if (clash.rows.length || l.name.toLowerCase() === "inbox") throw new TaskError(400, "You already have a list with that name.", "name");
      const r = await tx.query("UPDATE task_lists SET name = $2, updated_at = now() WHERE id = $1 RETURNING id", [id, l.name]);
      if (!r.rows.length) throw new TaskError(404, "That list doesn't exist.");
    });
  }

  /** Removes a list. Its tasks aren't lost: they move to the Inbox. */
  async removeList(spaceId: string, id: string) {
    return withSpace(this.db, spaceId, async (tx) => {
      await tx.query("UPDATE tasks SET list_id = NULL, updated_at = now() WHERE list_id = $1", [id]);
      const r = await tx.query("DELETE FROM task_lists WHERE id = $1 RETURNING id", [id]);
      if (!r.rows.length) throw new TaskError(404, "That list doesn't exist.");
    });
  }

  // ---------------------------------------------------------------------------------------------

  private async one(tx: Queryable, id: string) {
    const r = (await tx.query<Row>(`${SELECT} WHERE t.id = $1 AND NOT t.deleted`, [id])).rows[0];
    if (!r) throw new TaskError(404, "That task doesn't exist.");
    return task(r);
  }

  /** A list or goal named by id must exist in this space (row security hides everyone else's). */
  private async checkLinks(tx: Queryable, listId?: string | null, goalId?: string | null) {
    if (listId && !(await tx.query("SELECT 1 FROM task_lists WHERE id = $1", [listId])).rows.length) throw new TaskError(400, "Choose one of your lists.", "listId");
    if (goalId && !(await tx.query("SELECT 1 FROM money_goals WHERE id = $1 AND NOT archived", [goalId])).rows.length) throw new TaskError(400, "Choose one of your savings goals.", "goalId");
  }
}
