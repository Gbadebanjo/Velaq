# Velaq

One Platform. Every Business Function. This repository is the Velaq codebase: Velaq for Business, Velaq Personal and Velaq Marketplace on one shared foundation.

## Status

Foundation Slice 1 skeleton. Nothing here is a released feature yet.

| Area | State |
| --- | --- |
| `packages/contracts` | Feature registry (86 features), capability map, event envelope, platform constants. Tested. |
| `packages/db` | Drizzle schema and migrations for each database. Identity: accounts, email codes, sessions, rate limits, sign-in log. Business: tenants, audit log, outbox, entitlements, payee accounts (FND-032). Personal: spaces, audit log, outbox, entitlements. Forced row level security throughout. |
| `apps/api` | NestJS service. Each Personal account gets its own space on first use (FND-002); `/v1/space` returns it with the status of every Personal feature. Sign-in (`/v1/auth/*`: sign-up, email code, sign-in, forgot and reset password, sign-out). Every other route needs a session except `/health`. `/v1/me` returns the caller; `/v1/capabilities` checks features. |
| `apps/worker` | Outbox relay (at-least-once). Queue fan-out is the next step. |
| `apps/web` | Next.js site: landing page, sign-up with email code, sign-in, password reset, and the signed-in area `/app`. |

## Next up (Slice 1)

Signed-in app shell, authorisation, document store, notifications, audit writes from every feature, then the first Personal wave: PER-001, 002, 010, 011, 012, 030, 031, 032.

## Run it

Requires Node 22 and pnpm 9. Docker is optional.

```bash
pnpm install
pnpm dev                      # website http://localhost:3000 and API http://localhost:4000
```

That's enough to sign up and sign in. Without database URLs, the API keeps sign-in and Personal data in built-in local databases (`apps/api/.data`), and the codes it would email are printed in the API terminal.

For the full setup with PostgreSQL:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d          # PostgreSQL (identity and product databases) and Redis
pnpm db:migrate               # migrates every database with an admin URL in .env
pnpm test                     # no Docker needed; tests use PGlite
```

## Rules the code already enforces

- Every tenant table has `tenant_id`, forced row level security, and a policy bound to the transaction's tenant. With no tenant set, queries return nothing.
- The application connects as `velaq_app` (no superuser, no bypass of row level security). Migrations use the admin URL only.
- The audit log is append-only for the application role.
- Events carry IDs and non-Restricted values only; the outbox refuses Restricted keys such as salary or bank account.
- A tenant's offline lease is capped at 24 hours; it can be shortened, never extended.
- New payee accounts sit in a 48-hour cooling-off before they can be paid.
- Separate databases per product: `velaq_business`, `velaq_personal`, `velaq_marketplace`, plus `velaq_identity` for sign-in.
- Passwords are stored only as scrypt hashes, email codes only as HMACs, session tokens only as SHA-256 hashes.
- Sign-in answers never reveal whether an email has an account. Attempts are rate-limited per email and per visitor.
- A session is issued for one product; another product's API rejects it. Signing out or resetting the password ends sessions immediately.

## Not done yet

- Roles and permissions (FND-005): a person is always allowed in their own space for now.
- Two-step sign-in (authenticator app) for Business admins and payroll approvers, when Business is built.

## Database

PostgreSQL, one database per product, never shared:

| Database | Scope column | Holds |
| --- | --- | --- |
| `velaq_identity` | | Sign-in accounts, email codes and sessions for every product |
| `velaq_business` | `tenant_id` | Organisations and everything they run |
| `velaq_personal` | `space_id` | Each person's own space |
| `velaq_marketplace` | | Postings and applications (no tables yet) |

- **Schema** lives in `packages/db/src/schema/` as Drizzle tables. Use the typed clients `businessDb()` and `personalDb()`, and run queries inside `inScope(db, scopeId, tx => ...)` so the caller's tenant or space is bound.
- **Isolation:** every scoped table has forced row level security. A query with no scope bound returns nothing, and a row can't be written for anyone else's scope. The apps connect as `velaq_app`, which can't bypass it.
- **Changing the schema:** edit the schema file, then run `pnpm --filter @velaq/db generate:personal` (or `generate:business`) and commit the new file under `packages/db/migrations/<database>/`. Row level security and grants for a new table go in a custom migration: `pnpm --filter @velaq/db exec drizzle-kit generate --custom --config drizzle.personal.config.ts`.
- **Applying migrations:** `pnpm db:migrate` updates every database whose `DATABASE_ADMIN_URL_<NAME>` is set; `pnpm --filter @velaq/db migrate personal` does one. It is safe to run repeatedly.
- **Which database an app uses:** `PLANE` in `.env` (default `personal`) picks `DATABASE_URL_<PLANE>` for the API and worker.
- **Tests** run against PGlite, an in-process Postgres migrated exactly like the real one (`@velaq/db/testing`), so they need no Docker.
