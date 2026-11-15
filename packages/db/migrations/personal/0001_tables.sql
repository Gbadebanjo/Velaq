CREATE TABLE "audit_log" (
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"id" uuid NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before_enc" "bytea",
	"after_enc" "bytea",
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_space_id_id_pk" PRIMARY KEY("space_id","id")
);
--> statement-breakpoint
CREATE TABLE "feature_entitlements" (
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"feature_id" text NOT NULL,
	"entitled" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"off_since" timestamp with time zone,
	CONSTRAINT "feature_entitlements_space_id_feature_id_pk" PRIMARY KEY("space_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"space_id" uuid DEFAULT app_scope_id() NOT NULL,
	"id" uuid NOT NULL,
	"type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text NOT NULL,
	"data_class" text NOT NULL,
	"replayable" boolean DEFAULT true NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	CONSTRAINT "outbox_events_space_id_id_pk" PRIMARY KEY("space_id","id"),
	CONSTRAINT "outbox_events_idempotency_uq" UNIQUE("space_id","idempotency_key"),
	CONSTRAINT "outbox_events_data_class_ck" CHECK ("outbox_events"."data_class" IN ('public','internal','confidential'))
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"offline_lease_hours" integer DEFAULT 24 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_owner_user_id_unique" UNIQUE("owner_user_id"),
	CONSTRAINT "spaces_plan_ck" CHECK ("spaces"."plan" IN ('free','premium','hustle')),
	CONSTRAINT "spaces_offline_lease_ck" CHECK ("spaces"."offline_lease_hours" BETWEEN 1 AND 24)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_entitlements" ADD CONSTRAINT "feature_entitlements_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("occurred_at") WHERE "outbox_events"."dispatched_at" IS NULL;