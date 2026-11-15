CREATE TABLE "profile_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"section" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_entries_section_ck" CHECK ("profile_entries"."section" IN ('experience','education','certification','portfolio','link'))
);
--> statement-breakpoint
CREATE TABLE "profile_share_links" (
	"space_id" uuid PRIMARY KEY DEFAULT app_scope_id() NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"space_id" uuid PRIMARY KEY DEFAULT app_scope_id() NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"show_email" boolean DEFAULT false NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"visibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_entries" ADD CONSTRAINT "profile_entries_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_share_links" ADD CONSTRAINT "profile_share_links_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_entries_space_section_idx" ON "profile_entries" USING btree ("space_id","section","position");--> statement-breakpoint
-- Row level security: every profile row belongs to one person's space.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'profile_entries', 'profile_share_links']
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY scope_isolation ON %s USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- A visitor holding a share link may find whose profile it opens, and nothing more.
-- The API sets app.share_token for that one transaction; without the exact token no row is visible.
CREATE POLICY share_lookup ON profile_share_links FOR SELECT USING (token = current_setting('app.share_token', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON profiles TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_entries, profile_share_links TO velaq_app;
