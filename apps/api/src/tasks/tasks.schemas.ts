import { z } from "zod";

const tidy = (max: number, what: string, min = 1) =>
  z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().min(min, `Enter ${what}.`).max(max, `Use at most ${max} characters for ${what}.`));

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= "2000-01-01" && s <= "2099-12-31";
  }, "Choose a real date.");

const uuid = (msg: string) => z.string().uuid(msg);

export const REPEATS = ["daily", "weekdays", "weekly", "monthly", "yearly"] as const;

const fields = {
  title: tidy(200, "what the task is"),
  // Notes keep their line breaks.
  notes: z.string().transform((s) => s.trim()).pipe(z.string().max(2000, "Use at most 2,000 characters for notes.")),
  dueDate: day.nullable(),
  priority: z.number().int().min(0).max(3),
  repeat: z.enum(REPEATS).nullable(),
  listId: uuid("Choose one of your lists.").nullable(),
  goalId: uuid("Choose one of your savings goals.").nullable(),
};

export const taskSchema = z.object({
  title: fields.title,
  notes: fields.notes.default(""),
  dueDate: fields.dueDate.default(null),
  priority: fields.priority.default(0),
  repeat: fields.repeat.default(null),
  listId: fields.listId.default(null),
  goalId: fields.goalId.default(null),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const taskPatchSchema = z
  .object(fields)
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: "Nothing to change." });
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export const completeSchema = z.object({ done: z.boolean() });

export const listSchema = z.object({ name: tidy(40, "a name for the list") });
export type ListInput = z.infer<typeof listSchema>;

export const viewSchema = z.union([
  z.enum(["today", "upcoming", "inbox", "all", "completed"]),
  z.string().regex(/^list:[0-9a-f-]{36}$/i, "Unknown view."),
]);
