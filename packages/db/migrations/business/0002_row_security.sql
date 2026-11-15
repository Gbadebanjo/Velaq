-- Row level security for velaq_business, forced so even the table owner is subject to it.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log', 'outbox_events', 'feature_entitlements', 'cdm_payees.payee_accounts']
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY scope_isolation ON %s USING (tenant_id = app_scope_id()) WITH CHECK (tenant_id = app_scope_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY scope_isolation ON tenants USING (id = app_scope_id()) WITH CHECK (id = app_scope_id());
--> statement-breakpoint
-- The audit log is append-only for the application role.
GRANT USAGE ON SCHEMA public, cdm_payees TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tenants, feature_entitlements, outbox_events TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON cdm_payees.payee_accounts TO velaq_app;
