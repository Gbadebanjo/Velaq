-- The app may read and change accounts, codes and sessions, but never delete them,
-- and may only append to the security log. Rate-limit counters are pruned by the app.
GRANT USAGE ON SCHEMA public TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON accounts, email_codes, sessions TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO velaq_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON auth_events TO velaq_app;
