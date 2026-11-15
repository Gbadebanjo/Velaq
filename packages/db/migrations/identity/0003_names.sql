ALTER TABLE "accounts" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_first_name_ck" CHECK (char_length("accounts"."first_name") BETWEEN 1 AND 80);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_last_name_ck" CHECK (char_length("accounts"."last_name") BETWEEN 1 AND 80);