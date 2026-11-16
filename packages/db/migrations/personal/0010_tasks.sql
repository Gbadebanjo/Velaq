CREATE TABLE "task_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_lists_name_ck" CHECK (char_length("task_lists"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"list_id" uuid,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"due_date" date,
	"priority" integer DEFAULT 0 NOT NULL,
	"repeat" text,
	"goal_id" uuid,
	"repeat_of" uuid,
	"completed_at" timestamp with time zone,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_title_ck" CHECK (char_length("tasks"."title") BETWEEN 1 AND 200),
	CONSTRAINT "tasks_notes_ck" CHECK (char_length("tasks"."notes") <= 2000),
	CONSTRAINT "tasks_priority_ck" CHECK ("tasks"."priority" BETWEEN 0 AND 3),
	CONSTRAINT "tasks_repeat_ck" CHECK ("tasks"."repeat" IS NULL OR "tasks"."repeat" IN ('daily','weekdays','weekly','monthly','yearly'))
);
--> statement-breakpoint
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_id_task_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."task_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_money_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."money_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repeat_of_tasks_id_fk" FOREIGN KEY ("repeat_of") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_open_idx" ON "tasks" USING btree ("space_id","due_date") WHERE NOT "tasks"."deleted" AND "tasks"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tasks_list_idx" ON "tasks" USING btree ("space_id","list_id");--> statement-breakpoint
-- Row security: lists and tasks belong to one space.
ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_lists FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY scope_isolation ON task_lists USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id());--> statement-breakpoint
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY scope_isolation ON tasks USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON task_lists, tasks TO velaq_app;--> statement-breakpoint
-- Lists can be removed (their tasks move to the Inbox first); tasks are only ever marked deleted.
GRANT DELETE ON task_lists TO velaq_app;
