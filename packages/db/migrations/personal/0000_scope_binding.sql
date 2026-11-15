-- Scope binding, shared by every product database.
-- The API binds the caller's scope (a tenant in Business, a space in Personal) per transaction with
-- set_config('app.scope_id', <uuid>, true). With nothing bound, app_scope_id() is null and
-- row level security returns no rows: the database fails closed.
CREATE OR REPLACE FUNCTION app_scope_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.scope_id', true), '')::uuid
$$;
--> statement-breakpoint
-- The application connects as velaq_app: no superuser, cannot bypass row level security.
-- The local password is for development only; hosted databases set their own.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'velaq_app') THEN
    CREATE ROLE velaq_app LOGIN PASSWORD 'velaq_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
