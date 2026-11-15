CREATE TABLE "money_goal_contributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"goal_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"contrib_date" date NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"transaction_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_goal_contrib_kind_ck" CHECK ("money_goal_contributions"."kind" IN ('deposit','withdrawal')),
	CONSTRAINT "money_goal_contrib_amount_ck" CHECK ("money_goal_contributions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "money_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"name" text NOT NULL,
	"target" numeric(19, 4) NOT NULL,
	"target_date" date,
	"archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_goals_target_ck" CHECK ("money_goals"."target" > 0),
	CONSTRAINT "money_goals_name_ck" CHECK (char_length("money_goals"."name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
ALTER TABLE "money_goal_contributions" ADD CONSTRAINT "money_goal_contributions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_goal_contributions" ADD CONSTRAINT "money_goal_contributions_goal_id_money_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."money_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_goal_contributions" ADD CONSTRAINT "money_goal_contributions_transaction_id_money_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."money_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_goals" ADD CONSTRAINT "money_goals_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "money_goal_contrib_txn_uq" ON "money_goal_contributions" USING btree ("transaction_id") WHERE NOT "money_goal_contributions"."deleted";--> statement-breakpoint
CREATE INDEX "money_goal_contrib_goal_idx" ON "money_goal_contributions" USING btree ("space_id","goal_id");--> statement-breakpoint
-- Row security: goals and their contributions belong to one space.
ALTER TABLE money_goals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE money_goals FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY scope_isolation ON money_goals USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id());--> statement-breakpoint
ALTER TABLE money_goal_contributions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE money_goal_contributions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY scope_isolation ON money_goal_contributions USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON money_goals, money_goal_contributions TO velaq_app;
