/** Shapes and helpers for Income & Expense Tracking (PER-010), shared by pages and forms. */

export const MONEY_PATH = "/app/income-expense-tracking";

export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "CAD", "GHS", "KES", "ZAR", "XOF", "AED", "CNY"] as const;
export const ACCOUNT_KINDS: { id: string; name: string }[] = [
  { id: "bank", name: "Bank account" },
  { id: "cash", name: "Cash" },
  { id: "mobile_money", name: "Mobile money (OPay, Moniepoint, PalmPay…)" },
  { id: "card", name: "Card" },
  { id: "savings", name: "Savings or investment" },
  { id: "other", name: "Other" },
];

export interface Account {
  id: string;
  name: string;
  kind: string;
  currency: string;
  openingBalance: string;
  archived: boolean;
}
export interface Category {
  id: string;
  name: string;
  direction: "in" | "out";
  archived: boolean;
}
export interface MoneySetup {
  homeCurrency: string;
  homeCurrencyLocked: boolean;
  accounts: Account[];
  categories: Category[];
}
export interface Transaction {
  id: string;
  kind: "income" | "expense" | "transfer";
  date: string;
  amount: string;
  currency: string;
  fxRate: string;
  baseAmount: string;
  accountId: string;
  toAccountId: string | null;
  toAmount: string | null;
  categoryId: string | null;
  note: string;
  tags: string[];
  source: string;
  /** Part of this income set aside for a savings goal. */
  setAside?: { goalId: string; amount: string };
}
export interface Summary {
  month: string;
  homeCurrency: string;
  income: string;
  spending: string;
  net: string;
  spendingByCategory: { categoryId: string; amount: string }[];
  incomeByCategory: { categoryId: string; amount: string }[];
  balances: { accountId: string; balance: string }[];
  trend: { month: string; income: string; spending: string }[];
}

/** "₦12,500.00", "$1,200.00". Whole amounts drop the kobo when asked. */
export function money(amount: string | number, currency: string, o: { whole?: boolean; sign?: boolean } = {}): string {
  const n = Number(amount);
  const text = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: o.whole && Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${n < 0 ? "−" : o.sign && n > 0 ? "+" : ""}${text}`;
}

export const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

export function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}
export const monthName = (month: string, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat("en-GB", { month: style, year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
export const dayName = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

// ---- Budgets (PER-011) -----------------------------------------------------------------------------

export const BUDGETS_PATH = "/app/budgets";

export interface Budget {
  categoryId: string;
  name: string;
  limit: string;
  rollover: boolean;
  carried: string;
  available: string;
  spent: string;
  left: string;
  percent: number;
  state: "ok" | "near" | "over";
  perDay: string | null;
}
export interface BudgetMonth {
  month: string;
  homeCurrency: string;
  items: Budget[];
  unbudgeted: { categoryId: string; name: string; spent: string }[];
  totals: { budgeted: string; spentInBudgets: string; income: string; spending: string; outsideBudgets: string };
  plan: { limit: number | null; enforced: boolean; used: number };
}
export interface BudgetAlert {
  categoryId: string;
  name: string;
  month: string;
  state: "near" | "over";
  percent: number;
  available: string;
  spent: string;
  left: string;
}

/** "Food & groceries is at 84% of its budget" or "…is ₦2,000 over its budget". */
export const alertText = (a: { name: string; state: string; percent: number; left: string }, currency: string) =>
  a.state === "over" ? `${a.name} is ${money(-Number(a.left), currency)} over its budget.` : `${a.name} has used ${a.percent}% of its budget.`;

// ---- Savings Goals (PER-012) -----------------------------------------------------------------------

export const GOALS_PATH = "/app/savings-goals";

export interface Contribution {
  id: string;
  kind: "deposit" | "withdrawal";
  date: string;
  amount: string;
  note: string;
  transactionId: string | null;
}
export interface Goal {
  id: string;
  name: string;
  target: string;
  targetDate: string | null;
  archived: boolean;
  saved: string;
  remaining: string;
  percent: number;
  status: "reached" | "on_track" | "behind" | "overdue" | "no_date" | "not_started";
  monthlyNeeded: string | null;
  pace: string;
  projectedMonth: string | null;
  contributions: Contribution[];
}
export interface GoalList {
  homeCurrency: string;
  goals: Goal[];
  totals: { saved: string; target: string };
}
