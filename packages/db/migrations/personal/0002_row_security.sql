-- Row level security for velaq_personal, forced so even the table owner is subject to it.
-- Every row belongs to exactly one person's space.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log', 'outbox_events', 'feature_entitlements']
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY scope_isolation ON %s USING (space_id = app_scope_id()) WITH CHECK (space_id = app_scope_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE spaces FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY scope_isolation ON spaces USING (id = app_scope_id()) WITH CHECK (id = app_scope_id());
--> statement-breakpoint
-- The audit log is append-only for the application role.
GRANT USAGE ON SCHEMA public TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON spaces, feature_entitlements, outbox_events TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO velaq_app;
