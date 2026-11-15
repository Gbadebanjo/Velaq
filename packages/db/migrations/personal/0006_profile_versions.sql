CREATE TABLE "profile_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"name" text NOT NULL,
	"job_title" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"job_description" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_versions_name_ck" CHECK (char_length("profile_versions"."name") BETWEEN 1 AND 120),
	CONSTRAINT "profile_versions_jd_ck" CHECK (char_length("profile_versions"."job_description") <= 12000)
);
--> statement-breakpoint
ALTER TABLE "profile_versions" ADD CONSTRAINT "profile_versions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_versions_space_idx" ON "profile_versions" USING btree ("space_id","created_at");--> statement-breakpoint
ALTER TABLE profile_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE profile_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY scope_isolation ON profile_versions USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_versions TO velaq_app;
