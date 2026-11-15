CREATE SCHEMA "cdm_payees";
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"tenant_id" uuid DEFAULT app_scope_id() NOT NULL,
	"id" uuid NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before_enc" "bytea",
	"after_enc" "bytea",
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "feature_entitlements" (
	"tenant_id" uuid DEFAULT app_scope_id() NOT NULL,
	"feature_id" text NOT NULL,
	"entitled" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"off_since" timestamp with time zone,
	CONSTRAINT "feature_entitlements_tenant_id_feature_id_pk" PRIMARY KEY("tenant_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"tenant_id" uuid DEFAULT app_scope_id() NOT NULL,
	"id" uuid NOT NULL,
	"type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text NOT NULL,
	"data_class" text NOT NULL,
	"replayable" boolean DEFAULT true NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	CONSTRAINT "outbox_events_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "outbox_events_idempotency_uq" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "outbox_events_data_class_ck" CHECK ("outbox_events"."data_class" IN ('public','internal','confidential'))
);
--> statement-breakpoint
CREATE TABLE "cdm_payees"."payee_accounts" (
	"tenant_id" uuid DEFAULT app_scope_id() NOT NULL,
	"id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"account_enc" "bytea" NOT NULL,
	"account_hmac" text NOT NULL,
	"status" text DEFAULT 'cooling_off' NOT NULL,
	"usable_after" timestamp with time zone DEFAULT now() + interval '48 hours' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payee_accounts_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "payee_accounts_status_ck" CHECK ("cdm_payees"."payee_accounts"."status" IN ('cooling_off','active','retired'))
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"offline_lease_hours" integer DEFAULT 24 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_offline_lease_ck" CHECK ("tenants"."offline_lease_hours" BETWEEN 1 AND 24)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_entitlements" ADD CONSTRAINT "feature_entitlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdm_payees"."payee_accounts" ADD CONSTRAINT "payee_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("occurred_at") WHERE "outbox_events"."dispatched_at" IS NULL;