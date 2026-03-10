# Racer auth starter (Next.js + Turso)

This app includes a basic account creation + login flow backed by Turso.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Set your Turso values:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `AUTH_SESSION_SECRET` (long random string for signing auth cookies)
3. Install dependencies and run the app:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database schema migration

Run this once to apply the full race-day schema to Turso:

```bash
pnpm db:migrate
```

This migration is idempotent (`CREATE ... IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`) and safe to re-run.

## What is included

- `app/page.tsx` - one page with **Create Account** and **Login** modes.
- `app/api/auth/signup/route.ts` - creates account records in Turso.
- `app/api/auth/login/route.ts` - verifies credentials against Turso.
- `app/account/page.tsx` - authorized-only page showing the logged-in email.
- `app/account/race-manager.tsx` - set up events/divisions, then generate races when registrations are ready.
- `lib/turso.ts` - Turso client + automatic database schema initialization.
- `lib/password.ts` - password hashing and verification using Node `crypto` (`scrypt`).
- `lib/session.ts` - signed cookie session helpers.

## Notes

- Passwords are stored as salted hashes, not plaintext.
- Successful login sets a signed HTTP-only cookie and redirects to `/account`.
- The `/account` page supports event-first workflow: create multiple divisions, register/assign racers, then generate races.
