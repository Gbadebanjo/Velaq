-- The application connects as velaq_app: no superuser, cannot bypass row level security.
-- The local password is for development only; hosted databases set their own.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'velaq_app') THEN
    CREATE ROLE velaq_app LOGIN PASSWORD 'velaq_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
