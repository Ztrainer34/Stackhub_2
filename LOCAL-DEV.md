# Running StackHub locally

A full local stack — Postgres, Auth and Storage in Docker — so you can test
changes without touching the production Supabase project or the live site.

**Nothing here can reach production.** The local backend reads `backend/.env` on
your machine; the VPS has its own copy that is gitignored and never pulled. The
local frontend reads `frontend/.env.local`, which Vercel ignores entirely.

## Prerequisites

- **Docker** — already installed (28.4.0)
- **Go** — `winget install GoLang.Go`, then open a new terminal.
  Needed to run the backend at all. Also worth it on its own: `go build ./...`
  from `backend/` is the only way to find out whether backend changes compile
  before they reach the VPS.

The Supabase CLI is run through `npx`, so there is nothing to install.

## 1. Start the stack

```powershell
cd C:\Users\Ziagu\Stackhub_2
npx supabase start
```

First run pulls several Docker images — allow 10–20 minutes. Afterwards it takes
seconds.

It prints the credentials you need. `npx supabase status` reprints them.

| | |
|---|---|
| API / Supabase URL | `http://127.0.0.1:54321` |
| Database | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (table editor) | `http://127.0.0.1:54323` |
| **Inbucket (all outgoing email)** | `http://127.0.0.1:54324` |

Magic links land in Inbucket instead of a real inbox. Nothing is sent, nothing
costs anything, and you can sign up as many test users as you like.

## 2. Schema

`supabase/migrations/00000000000000_baseline.sql` holds every migration's Up
section concatenated in order. It is generated, not hand-written:

```powershell
node backend/db/build-schema.mjs
```

Run that after adding any migration. It writes both the baseline above and
`backend/db/schema.generated.sql` (the same SQL, for pasting into a cloud
project's SQL editor).

**Why it is generated:** 18 of the 19 migrations carry a `-- +goose Down`
section that `DROP`s what the Up section just created. Supabase treats those
markers as ordinary comments and runs the whole file, so copying the migrations
in unmodified creates every table and immediately drops it — an empty database
with no error to explain it. The generator cuts each file at the Down marker.

`supabase start` applies the baseline automatically. To wipe and rebuild:

```powershell
npx supabase db reset
```

## 3. Seed data

The database starts empty, so tool and profile pages 404 until it has rows.

```powershell
cd frontend
$env:SUPABASE_URL = "http://127.0.0.1:54321"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key from supabase status>"
node scripts/seed.mjs scripts/seed-data.local.json
```

That creates two users (`alice` / `bob`, password `Password123!`), eight tools
and three playbooks — deliberately small, and shaped around what actually needs
testing. Two accounts because following, feed tiers and the claim CTA as a
non-owner are all invisible with only one.

## 4. Environment files

Both are gitignored. Fill in from `npx supabase status`.

**`frontend/.env.local`**

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_API_URL=http://localhost:8080
```

**`backend/.env`**

```
DB_CONNECTION=postgresql://postgres:postgres@127.0.0.1:54322/postgres
JWT_SECRET=<JWT secret from supabase status>
SUPABASE_PROJECT_REF=local
S3_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3
S3_REGION=local
S3_ACCESS_KEY=<from supabase status>
S3_SECRET_ACCESS_KEY=<from supabase status>
S3_BUCKET_NAME=images
RESEND_API_KEY=re_dummy_value_not_used_locally
```

> **`JWT_SECRET` must be the local one.** The backend verifies tokens with
> `jwtauth.New("HS256", jwtSecret, jwtSecret)` — the same symmetric secret
> Supabase signed them with. Leave a production `JWT_SECRET` in place against a
> local database and every authenticated request 401s, with nothing in the logs
> explaining why. All four of `DB_CONNECTION`, `JWT_SECRET`,
> `SUPABASE_PROJECT_REF` and the `S3_*` values belong to one Supabase project;
> they cannot be mixed.

## 5. Run it

```powershell
# terminal 1
cd backend
.\run-local.ps1                 # localhost:8080

# terminal 2
cd frontend
pnpm dev                        # localhost:3000
```

> **Do not run `go run cmd/server/main.go` directly.** The server never reads
> `.env` — `main.go` only calls `os.LookupEnv` and panics on the first variable
> it cannot find. `start.sh` works around this on Linux with
> `env $(cat .env | xargs) go run ...`; `run-local.ps1` is the PowerShell
> equivalent. It loads the file into the process only, so nothing lingers in your
> shell afterwards, and it prints the database host it is about to use so you can
> see at a glance that it is local.

**Port 3000 is not optional.** `frontend/app/login/actions.tsx` hardcodes
`http://localhost:3000/auth/callback` in development, and `supabase/config.toml`
allow-lists that exact string. Any other port and login silently fails.

## Known limitations

**Uploaded images get a broken URL.** `getPublicSupabaseBucketURL` in
`backend/cmd/server/main.go` builds `https://<ref>.supabase.co/storage/...`,
which has no local equivalent. Uploads succeed and the row is written, but the
image will not load. Logo and avatar *uploads* therefore cannot be tested
locally without teaching that function about a base-URL override. Pasting a logo
URL works fine.

**Production data is not here.** Eight tools, not sixteen thousand. If you need
to reproduce something that depends on real data — a slow query at scale, a
specific broken record — use a staging cloud project and a dump instead.

**Separate auth pool.** Your production account does not exist locally. Sign in
as `alice@local.test` or `bob@local.test`, or sign up fresh and collect the
magic link from Inbucket.

## Keeping production separate

Beyond the env files, the thing most likely to catch you out is the **scripts**.
Every `.mjs` in `frontend/scripts/` reads `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` from the shell, and those persist for the whole
terminal session. Set production credentials once to run an import, forget, and
a later script in the same window writes to production with a service-role key
that bypasses every RLS policy.

Use a separate terminal for local work and retitle it, or keep the two credential
sets in files and load one explicitly per session.

## Stopping

```powershell
npx supabase stop           # keeps the data
npx supabase stop --no-backup   # discards it
```
