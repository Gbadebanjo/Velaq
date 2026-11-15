import { z } from "zod";

/** Currencies offered. Naira first; the rest are those Nigerians most often hold or earn in. */
export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "CAD", "GHS", "KES", "ZAR", "XOF", "AED", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ACCOUNT_KINDS = ["cash", "bank", "mobile_money", "card", "savings", "other"] as const;

/**
 * An amount as typed: "12500", "12,500.50", "₦12,500". Kept as a decimal string, never a float,
 * so kobo are never lost; arithmetic happens in the database.
 */
export const amountSchema = (what = "the amount") =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/[₦$£€,\s]/g, "").replace(/^NGN/i, ""))
    .refine((s) => /^\d{1,13}(\.\d{1,2})?$/.test(s), `Enter ${what} as a number, like 12500 or 12,500.50.`)
    .refine((s) => Number(s) > 0, `Enter ${what} above zero.`);

/** An exchange rate: how many units of the home currency one unit of the foreign currency cost. */
export const rateSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/[,\s]/g, ""))
  .refine((s) => /^\d{1,10}(\.\d{1,8})?$/.test(s) && Number(s) > 0, "Enter the exchange rate as a number, like 1550.");

const name = (max: number, what: string) =>
  z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().min(1, `Enter ${what}.`).max(max, `Use at most ${max} characters for ${what}.`));

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && s >= "2000-01-01", "Choose a real date.")
  .refine((s) => s <= new Date(Date.now() + 366 * 864e5).toISOString().slice(0, 10), "That date is too far ahead.");

export const settingsSchema = z.object({ homeCurrency: z.enum(CURRENCIES, { message: "Choose a currency." }) });

export const accountSchema = z.object({
  name: name(60, "a name, like GTBank or Cash"),
  kind: z.enum(ACCOUNT_KINDS, { message: "Choose the kind of account." }),
  currency: z.enum(CURRENCIES, { message: "Choose a currency." }),
  openingBalance: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/[₦$£€,\s]/g, "") || "0")
    .refine((s) => /^-?\d{1,13}(\.\d{1,2})?$/.test(s), "Enter the balance as a number, like 50000.")
    .default("0"),
});
export const accountUpdateSchema = z.object({ name: name(60, "a name").optional(), archived: z.boolean().optional() });

export const categorySchema = z.object({ name: name(40, "a name"), direction: z.enum(["in", "out"]) });
export const categoryUpdateSchema = z.object({ name: name(40, "a name").optional(), archived: z.boolean().optional() });

export const transactionSchema = z
  .object({
    kind: z.enum(["income", "expense", "transfer"]),
    date: day,
    amount: amountSchema(),
    accountId: z.string().uuid("Choose an account."),
    categoryId: z.string().uuid().optional().nullable(),
    toAccountId: z.string().uuid().optional().nullable(),
    toAmount: amountSchema("the amount received").optional().nullable(),
    fxRate: rateSchema.optional().nullable(),
    note: z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().max(200, "Use at most 200 characters for the note.")).default(""),
    tags: z.array(z.string().transform((s) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase()).pipe(z.string().min(1).max(30))).max(10).default([]),
  })
  .refine((t) => t.kind === "transfer" || !!t.categoryId, { message: "Choose a category.", path: ["categoryId"] })
  .refine((t) => t.kind !== "transfer" || !!t.toAccountId, { message: "Choose the account the money went to.", path: ["toAccountId"] })
  .refine((t) => t.kind !== "transfer" || t.toAccountId !== t.accountId, { message: "Choose a different account to move money to.", path: ["toAccountId"] });
export type TransactionInput = z.infer<typeof transactionSchema>;

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month.");

// ---- CSV import ---------------------------------------------------------------------------------

export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY"] as const;

export const csvSchema = z.object({
  csv: z.string().min(1, "Choose a CSV file.").max(1_000_000, "That file is too big. Use a statement of at most 1 MB, or split it by month."),
});

export const mappingSchema = z.object({
  headerRow: z.number().int().min(0),
  date: z.number().int().min(0),
  dateFormat: z.enum(DATE_FORMATS),
  description: z.number().int().min(0),
  /** One signed amount column, or separate money-out and money-in columns. */
  amount: z.number().int().min(0).nullable(),
  debit: z.number().int().min(0).nullable(),
  credit: z.number().int().min(0).nullable(),
});
export type Mapping = z.infer<typeof mappingSchema>;

export const previewSchema = csvSchema.extend({ mapping: mappingSchema, accountId: z.string().uuid("Choose the account this statement is for.") });

export const commitSchema = z.object({
  accountId: z.string().uuid("Choose the account this statement is for."),
  items: z
    .array(
      z.object({
        date: day,
        description: z.string().transform((s) => s.replace(/\s+/g, " ").trim().slice(0, 200)),
        amount: amountSchema(),
        kind: z.enum(["income", "expense"]),
        categoryId: z.string().uuid("Choose a category."),
      }),
    )
    .min(1, "Choose at least one row to import.")
    .max(1000, "Import at most 1,000 rows at a time."),
});

// ---- Budgets (PER-011) --------------------------------------------------------------------------

export const budgetSchema = z.object({
  amount: amountSchema("the monthly limit"),
  rollover: z.boolean().default(false),
});

// ---- Savings Goals (PER-012) ---------------------------------------------------------------------

/** A goal can be years away, unlike an entry's date. */
const goalDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && s >= "2000-01-01" && s <= "2099-12-31", "Choose a real date.");
const goalName = z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().min(1, "Give the goal a name.").max(60, "Use at most 60 characters."));
export const goalSchema = z.object({
  name: goalName,
  target: amountSchema("the amount you want to save"),
  targetDate: goalDay.nullable().default(null),
});
export const goalUpdateSchema = z
  .object({ name: goalName, target: amountSchema("the amount you want to save"), targetDate: goalDay.nullable(), archived: z.boolean() })
  .partial()
  .refine((g) => Object.keys(g).length > 0, { message: "Nothing to change." });
export const contributionSchema = z.object({
  kind: z.enum(["deposit", "withdrawal"]).default("deposit"),
  date: day,
  amount: amountSchema(),
  note: z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().max(200, "Use at most 200 characters for the note.")).default(""),
});
/** Part of an income entry, set aside for a goal as it's recorded. */
export const setAsideSchema = z
  .object({ goalId: z.string().uuid("Choose a goal."), amount: amountSchema("the amount to set aside") })
  .nullable()
  .default(null);
