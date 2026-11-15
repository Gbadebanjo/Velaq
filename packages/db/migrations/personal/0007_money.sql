CREATE TABLE "money_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"currency" char(3) NOT NULL,
	"opening_balance" numeric(19, 4) DEFAULT '0' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_accounts_kind_ck" CHECK ("money_accounts"."kind" IN ('cash','bank','mobile_money','card','savings','other')),
	CONSTRAINT "money_accounts_name_ck" CHECK (char_length("money_accounts"."name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "money_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_categories_direction_ck" CHECK ("money_categories"."direction" IN ('in','out')),
	CONSTRAINT "money_categories_name_ck" CHECK (char_length("money_categories"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "money_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"entry_date" date NOT NULL,
	"kind" text NOT NULL,
	"source_feature" text NOT NULL,
	"source_record" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"currency" char(3) NOT NULL,
	"total_amount" numeric(19, 4) NOT NULL,
	"reverses_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "money_entries_kind_ck" CHECK ("money_entries"."kind" IN ('personal_income','personal_spend','transfer','savings')),
	CONSTRAINT "money_entries_total_ck" CHECK ("money_entries"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "money_entry_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"entry_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"category" text NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate" numeric(19, 8) DEFAULT '1' NOT NULL,
	"base_amount" numeric(19, 4) NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "money_lines_direction_ck" CHECK ("money_entry_lines"."direction" IN ('in','out')),
	CONSTRAINT "money_lines_amount_ck" CHECK ("money_entry_lines"."amount" > 0 AND "money_entry_lines"."base_amount" >= 0 AND "money_entry_lines"."fx_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "money_settings" (
	"space_id" uuid PRIMARY KEY DEFAULT app_scope_id() NOT NULL,
	"home_currency" char(3) DEFAULT 'NGN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"kind" text NOT NULL,
	"txn_date" date NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate" numeric(19, 8) DEFAULT '1' NOT NULL,
	"base_amount" numeric(19, 4) NOT NULL,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"to_amount" numeric(19, 4),
	"category_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"import_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_txn_kind_ck" CHECK ("money_transactions"."kind" IN ('income','expense','transfer')),
	CONSTRAINT "money_txn_amount_ck" CHECK ("money_transactions"."amount" > 0 AND "money_transactions"."fx_rate" > 0),
	CONSTRAINT "money_txn_transfer_ck" CHECK (("money_transactions"."kind" = 'transfer') = ("money_transactions"."to_account_id" IS NOT NULL AND "money_transactions"."to_amount" IS NOT NULL)),
	CONSTRAINT "money_txn_note_ck" CHECK (char_length("money_transactions"."note") <= 200),
	CONSTRAINT "money_txn_source_ck" CHECK ("money_transactions"."source" IN ('manual','csv','bank'))
);
--> statement-breakpoint
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_categories" ADD CONSTRAINT "money_categories_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_reverses_entry_id_money_entries_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."money_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entry_lines" ADD CONSTRAINT "money_entry_lines_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entry_lines" ADD CONSTRAINT "money_entry_lines_entry_id_money_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."money_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_settings" ADD CONSTRAINT "money_settings_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_transactions" ADD CONSTRAINT "money_transactions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_transactions" ADD CONSTRAINT "money_transactions_account_id_money_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_transactions" ADD CONSTRAINT "money_transactions_to_account_id_money_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."money_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_transactions" ADD CONSTRAINT "money_transactions_category_id_money_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."money_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "money_accounts_space_idx" ON "money_accounts" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "money_categories_space_idx" ON "money_categories" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "money_entries_source_uq" ON "money_entries" USING btree ("space_id","source_feature","source_record","source_version");--> statement-breakpoint
CREATE UNIQUE INDEX "money_entries_reverses_uq" ON "money_entries" USING btree ("reverses_entry_id");--> statement-breakpoint
CREATE INDEX "money_entries_space_date_idx" ON "money_entries" USING btree ("space_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "money_lines_entry_line_uq" ON "money_entry_lines" USING btree ("entry_id","line_no");--> statement-breakpoint
CREATE INDEX "money_lines_space_idx" ON "money_entry_lines" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "money_txn_space_date_idx" ON "money_transactions" USING btree ("space_id","txn_date");--> statement-breakpoint
CREATE UNIQUE INDEX "money_txn_import_uq" ON "money_transactions" USING btree ("space_id","account_id","import_hash");--> statement-breakpoint
-- Row level security: every money row belongs to one person's space.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['money_entries', 'money_entry_lines', 'money_settings', 'money_accounts', 'money_categories', 'money_transactions']
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY scope_isolation ON %s USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The Money Journal is append-only: the app may read and insert, nothing else, and a trigger
-- refuses changes from anyone (DP-5). Corrections are new entries that reverse old ones.
CREATE FUNCTION money_journal_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The Money Journal is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER money_entries_append_only BEFORE UPDATE OR DELETE ON money_entries FOR EACH ROW EXECUTE FUNCTION money_journal_append_only();
--> statement-breakpoint
CREATE TRIGGER money_lines_append_only BEFORE UPDATE OR DELETE ON money_entry_lines FOR EACH ROW EXECUTE FUNCTION money_journal_append_only();
--> statement-breakpoint
-- Balanced: checked when the transaction commits, so an entry and its lines can be written in any order.
-- Money in and money out (in the home currency) must each equal the entry total, or be zero:
-- income has only "in" lines, spending only "out" lines, and a transfer has both.
CREATE FUNCTION money_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  e money_entries%ROWTYPE;
  ins numeric;
  outs numeric;
  eid uuid := (to_jsonb(NEW) ->> CASE WHEN TG_TABLE_NAME = 'money_entries' THEN 'id' ELSE 'entry_id' END)::uuid;
BEGIN
  SELECT * INTO e FROM money_entries WHERE id = eid;
  SELECT coalesce(sum(base_amount) FILTER (WHERE direction = 'in'), 0),
         coalesce(sum(base_amount) FILTER (WHERE direction = 'out'), 0)
    INTO ins, outs FROM money_entry_lines WHERE entry_id = eid;
  IF ins + outs = 0 OR NOT ((ins = e.total_amount AND outs = 0) OR (outs = e.total_amount AND ins = 0) OR (ins = e.total_amount AND outs = e.total_amount)) THEN
    RAISE EXCEPTION 'Money Journal entry % is not balanced (in %, out %, total %)', eid, ins, outs, e.total_amount
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER money_entries_balanced AFTER INSERT ON money_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION money_entry_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER money_lines_balanced AFTER INSERT ON money_entry_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION money_entry_balanced();
--> statement-breakpoint
GRANT SELECT, INSERT ON money_entries, money_entry_lines TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON money_settings, money_accounts, money_categories, money_transactions TO velaq_app;
