CREATE TABLE "money_budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"category_id" uuid NOT NULL,
	"from_month" date NOT NULL,
	"amount" numeric(19, 4),
	"rollover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_budgets_amount_ck" CHECK ("money_budgets"."amount" IS NULL OR "money_budgets"."amount" > 0),
	CONSTRAINT "money_budgets_month_ck" CHECK (extract(day FROM "money_budgets"."from_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "money_budgets" ADD CONSTRAINT "money_budgets_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_budgets" ADD CONSTRAINT "money_budgets_category_id_money_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."money_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "money_budgets_uq" ON "money_budgets" USING btree ("space_id","category_id","from_month");--> statement-breakpoint
-- Row security: a budget belongs to one space, like everything else in Personal.
ALTER TABLE money_budgets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE money_budgets FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY scope_isolation ON money_budgets USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON money_budgets TO velaq_app;
