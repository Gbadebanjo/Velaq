/** velaq_personal: one row-level-secured space per individual (space_id). No organisation data lives here. */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, char, check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, scopeColumn } from "./columns.js";
import { auditLogTable, featureEntitlementsTable, outboxEventsTable } from "./shared.js";

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey(),
    // The identity provider's user id (Clerk). One space per person.
    ownerUserId: text("owner_user_id").notNull().unique(),
    plan: text("plan").notNull().default("free"),
    offlineLeaseHours: integer("offline_lease_hours").notNull().default(24),
    createdAt: createdAt(),
  },
  (t) => [
    check("spaces_plan_ck", sql`${t.plan} IN ('free','premium','hustle')`),
    check("spaces_offline_lease_ck", sql`${t.offlineLeaseHours} BETWEEN 1 AND 24`),
  ],
);

export const auditLog = auditLogTable("space_id", () => spaces.id);
export const outboxEvents = outboxEventsTable("space_id", () => spaces.id);
export const featureEntitlements = featureEntitlementsTable("space_id", () => spaces.id);

// ---------------------------------------------------------------------------------------------
// PER-001 Professional Profile: a living CV the person owns. One profile per space.

const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** The profile's single-value parts: headline, contact details, skills and the chosen CV design. */
export const profiles = pgTable("profiles", {
  spaceId: scopeColumn("space_id", () => spaces.id).primaryKey(),
  headline: text("headline").notNull().default(""),
  location: text("location").notNull().default(""),
  about: text("about").notNull().default(""),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default(""),
  showEmail: boolean("show_email").notNull().default(false),
  skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
  // The CV design used for downloads, the owner's and share-link visitors' alike.
  cvTemplate: text("cv_template").notNull().default("classic"),
  updatedAt: updatedAt(),
}, (t) => [check("profiles_cv_template_ck", sql`${t.cvTemplate} IN ('classic','modern','sidebar')`)]);

/** Repeating entries: jobs, schooling, certifications, portfolio pieces and contact links. */
export const profileEntries = pgTable(
  "profile_entries",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    section: text("section").notNull(),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("profile_entries_section_ck", sql`${t.section} IN ('experience','education','certification','portfolio','link')`),
    index("profile_entries_space_section_idx").on(t.spaceId, t.section, t.position),
  ],
);

/**
 * The private link that opens a read-only copy of the whole profile. One per space.
 * Row level security lets a request read a row only for its own space, or when it presents the token.
 */
export const profileShareLinks = pgTable("profile_share_links", {
  spaceId: scopeColumn("space_id", () => spaces.id).primaryKey(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
});

/**
 * Tailored versions of the profile, one per job applied for. Each holds a full snapshot of the
 * CV as approved by the person, so later edits to the main profile never change a version
 * already sent, and tailoring never touches the main profile.
 */
export const profileVersions = pgTable(
  "profile_versions",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    name: text("name").notNull(),
    jobTitle: text("job_title").notNull(),
    company: text("company").notNull().default(""),
    jobDescription: text("job_description").notNull().default(""),
    content: jsonb("content").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("profile_versions_name_ck", sql`char_length(${t.name}) BETWEEN 1 AND 120`),
    check("profile_versions_jd_ck", sql`char_length(${t.jobDescription}) <= 12000`),
    index("profile_versions_space_idx").on(t.spaceId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------------------------
// FND-026 Money Journal (Personal): the single, permanent record of every money event in a space.
// Append-only (the app may only read and insert; a trigger rejects changes), idempotent (one entry
// per source record version) and balanced (lines add up to the entry total, checked at commit).
// Corrections are new entries that reverse earlier ones; nothing is edited or deleted.

const money = (name: string) => numeric(name, { precision: 19, scale: 4 });

export const moneyEntries = pgTable(
  "money_entries",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    entryDate: date("entry_date").notNull(),
    kind: text("kind").notNull(),
    sourceFeature: text("source_feature").notNull(),
    sourceRecord: uuid("source_record").notNull(),
    sourceVersion: integer("source_version").notNull(),
    description: text("description").notNull().default(""),
    currency: char("currency", { length: 3 }).notNull(),
    totalAmount: money("total_amount").notNull(),
    reversesEntryId: uuid("reverses_entry_id").references((): AnyPgColumn => moneyEntries.id),
    createdAt: createdAt(),
    createdBy: uuid("created_by").notNull(),
  },
  (t) => [
    check("money_entries_kind_ck", sql`${t.kind} IN ('personal_income','personal_spend','transfer','savings')`),
    check("money_entries_total_ck", sql`${t.totalAmount} >= 0`),
    uniqueIndex("money_entries_source_uq").on(t.spaceId, t.sourceFeature, t.sourceRecord, t.sourceVersion),
    uniqueIndex("money_entries_reverses_uq").on(t.reversesEntryId),
    index("money_entries_space_date_idx").on(t.spaceId, t.entryDate),
  ],
);

export const moneyEntryLines = pgTable(
  "money_entry_lines",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    entryId: uuid("entry_id").notNull().references(() => moneyEntries.id),
    lineNo: integer("line_no").notNull(),
    category: text("category").notNull(),
    direction: text("direction").notNull(),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    fxRate: numeric("fx_rate", { precision: 19, scale: 8 }).notNull().default("1"),
    baseAmount: money("base_amount").notNull(),
    // account_id, tags and other dimensions the reports group by.
    dimensions: jsonb("dimensions").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    check("money_lines_direction_ck", sql`${t.direction} IN ('in','out')`),
    check("money_lines_amount_ck", sql`${t.amount} > 0 AND ${t.baseAmount} >= 0 AND ${t.fxRate} > 0`),
    uniqueIndex("money_lines_entry_line_uq").on(t.entryId, t.lineNo),
    index("money_lines_space_idx").on(t.spaceId),
  ],
);

// ---------------------------------------------------------------------------------------------
// PER-010 Income & Expense Tracking: the person's own, editable records. Every change to a
// transaction posts to the Money Journal (a new entry, or a reversal plus a new entry).

export const moneySettings = pgTable(
  "money_settings",
  {
    spaceId: scopeColumn("space_id", () => spaces.id).primaryKey(),
    homeCurrency: char("home_currency", { length: 3 }).notNull().default("NGN"),
    createdAt: createdAt(),
  },
);

export const moneyAccounts = pgTable(
  "money_accounts",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    openingBalance: money("opening_balance").notNull().default("0"),
    archived: boolean("archived").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check("money_accounts_kind_ck", sql`${t.kind} IN ('cash','bank','mobile_money','card','savings','other')`),
    check("money_accounts_name_ck", sql`char_length(${t.name}) BETWEEN 1 AND 60`),
    index("money_accounts_space_idx").on(t.spaceId),
  ],
);

export const moneyCategories = pgTable(
  "money_categories",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    name: text("name").notNull(),
    direction: text("direction").notNull(),
    archived: boolean("archived").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check("money_categories_direction_ck", sql`${t.direction} IN ('in','out')`),
    check("money_categories_name_ck", sql`char_length(${t.name}) BETWEEN 1 AND 40`),
    index("money_categories_space_idx").on(t.spaceId),
  ],
);

export const moneyTransactions = pgTable(
  "money_transactions",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    kind: text("kind").notNull(),
    txnDate: date("txn_date").notNull(),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    fxRate: numeric("fx_rate", { precision: 19, scale: 8 }).notNull().default("1"),
    baseAmount: money("base_amount").notNull(),
    accountId: uuid("account_id").notNull().references(() => moneyAccounts.id),
    toAccountId: uuid("to_account_id").references(() => moneyAccounts.id),
    toAmount: money("to_amount"),
    categoryId: uuid("category_id").references(() => moneyCategories.id),
    note: text("note").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    version: integer("version").notNull().default(1),
    deleted: boolean("deleted").notNull().default(false),
    // Where it came from: typed in, a CSV import, or (later) a bank connection.
    source: text("source").notNull().default("manual"),
    importHash: text("import_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("money_txn_kind_ck", sql`${t.kind} IN ('income','expense','transfer')`),
    check("money_txn_amount_ck", sql`${t.amount} > 0 AND ${t.fxRate} > 0`),
    check("money_txn_transfer_ck", sql`(${t.kind} = 'transfer') = (${t.toAccountId} IS NOT NULL AND ${t.toAmount} IS NOT NULL)`),
    check("money_txn_note_ck", sql`char_length(${t.note}) <= 200`),
    check("money_txn_source_ck", sql`${t.source} IN ('manual','csv','bank')`),
    index("money_txn_space_date_idx").on(t.spaceId, t.txnDate),
    uniqueIndex("money_txn_import_uq").on(t.spaceId, t.accountId, t.importHash),
  ],
);

// ---- Budgets (PER-011) -----------------------------------------------------------------------------
// A budget is a monthly limit on one spending category. Each row says "from this month on, the limit is
// this", so changing a limit never rewrites past months. A row with no amount means the budget stopped.

export const moneyBudgets = pgTable(
  "money_budgets",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    categoryId: uuid("category_id").notNull().references(() => moneyCategories.id),
    /** The first day of the month this limit starts. */
    fromMonth: date("from_month").notNull(),
    amount: money("amount"),
    /** Unspent money is added to the next month's limit. */
    rollover: boolean("rollover").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("money_budgets_amount_ck", sql`${t.amount} IS NULL OR ${t.amount} > 0`),
    check("money_budgets_month_ck", sql`extract(day FROM ${t.fromMonth}) = 1`),
    uniqueIndex("money_budgets_uq").on(t.spaceId, t.categoryId, t.fromMonth),
  ],
);

// ---- Savings Goals (PER-012) -------------------------------------------------------------------------
// A goal is money the person sets aside for something. Setting money aside doesn't move it between
// accounts; it earmarks it. Each contribution posts to the Money Journal (kind 'savings'), and how much
// a goal holds is always read from there.

export const moneyGoals = pgTable(
  "money_goals",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    name: text("name").notNull(),
    /** In the home currency. */
    target: money("target").notNull(),
    targetDate: date("target_date"),
    archived: boolean("archived").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("money_goals_target_ck", sql`${t.target} > 0`),
    check("money_goals_name_ck", sql`char_length(${t.name}) BETWEEN 1 AND 60`),
  ],
);

export const moneyGoalContributions = pgTable(
  "money_goal_contributions",
  {
    id: uuid("id").primaryKey(),
    spaceId: scopeColumn("space_id", () => spaces.id),
    goalId: uuid("goal_id").notNull().references(() => moneyGoals.id),
    /** deposit adds to the goal; withdrawal takes money back out of it. */
    kind: text("kind").notNull(),
    contribDate: date("contrib_date").notNull(),
    amount: money("amount").notNull(),
    note: text("note").notNull().default(""),
    /** Set when the money was set aside while recording an income entry. */
    transactionId: uuid("transaction_id").references(() => moneyTransactions.id),
    version: integer("version").notNull().default(1),
    deleted: boolean("deleted").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("money_goal_contrib_kind_ck", sql`${t.kind} IN ('deposit','withdrawal')`),
    check("money_goal_contrib_amount_ck", sql`${t.amount} > 0`),
    uniqueIndex("money_goal_contrib_txn_uq").on(t.transactionId).where(sql`NOT ${t.deleted}`),
    index("money_goal_contrib_goal_idx").on(t.spaceId, t.goalId),
  ],
);
