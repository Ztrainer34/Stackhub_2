# CLAUDE.md — StackHub

Context for AI assistants. Only what the code cannot tell you. Previous long
version: `docs/CLAUDE.old.md` (do not load it routinely).

## Overview

**StackHub** is a knowledge-sharing platform for marketing tools. Users publish
**playbooks** (a guide using one or more tools) and **comparisons** (2+ tools).
A third type, *combos*, was removed in Oct 2026 (it is just a playbook).

## Tech stack

- **Backend (Go):** Chi v5, PostgreSQL via pgx/v5, sqlc for queries, JWT from
  Supabase Auth, Supabase Storage (S3-compatible) for images, Resend for email.
- **Frontend (Next.js 15, App Router):** React 19, TanStack Query for server
  state, React Hook Form + Zod, **Tiptap** editor (leftover Lexical files are
  dead — ignore them), Tailwind + shadcn/ui, Supabase Auth client.
- **Database:** Supabase Postgres. Local copy: `supabase/` (Docker, `npx supabase start`).

## Structure (top two levels)

```
backend/
  cmd/server/      wiring only: main.go, routes.go (THE routing table), testdata/routes.golden
  internal/        one package per module: post tool ticket user search stack feed
                   notification category onboarding, plus shared httpx apperr pg
                   validate content storage testdb
  pkg/             db (sqlc output), auth, middleware, mail
  db/              query.sql, migrations/, scripts/, sqlc-stubs/
frontend/
  app/ components/ lib/ utils/ tests/
  scripts/         service-role maintenance scripts (*.mjs); see scripts/CLAUDE.md
.claude/           agents and the /ship command
supabase/          local Supabase config
```

## Backend rules

- **`routes.go` is the single routing table.** Modules never register their own
  routes: the auth groups are the security boundary and are reviewed in one
  place. `routes.golden` pins every route's handler, middleware and anonymous
  access. After changing routes: `go test ./cmd/server -run TestRouteTable -update-routes`.
- **Modules depend one way:** `post` → `ticket`, `post` → `notification`,
  `user` → `notification`, never the reverse (a cycle means the code is in the
  wrong module). Shared code lives in the shared packages, never copied.
- **Handlers** parse, call a query or service, encode. See
  `backend/internal/tool/handler.go` for the shape.
- **Services** (`service.go`) exist only where there is real logic (create post,
  star, ticket resolution, tool page edits, search). They return `apperr.*`
  errors, take a `pg.TxBeginner`, and **never import `net/http`, chi or `httpx`**
  (`TestServicesDoNotImportHTTP` enforces it). Validation is a pure function
  called first inside the service. Do not add a service for a one-query handler.
- **Auth:** `httpx.UserID(r)` in the required group, `httpx.UserIDIfPresent(r)`
  in the optional group. Frontend: `getServerAuthState()` in server components
  (`lib/auth-server.ts`), `useAuth()` in client components. `/me` returns
  200 / 401 / 428 (needs onboarding).
- **Integration tests** run only against a LOCAL database:
  `TEST_DB_CONNECTION=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
  They refuse hosted databases. `cmd/server/characterisation_integration_test.go`
  pins create post, star, ticket resolution, tool page edits and search: run it
  before and after touching any of them.

## SQL and sqlc

**Never hand-edit `backend/pkg/db/`.** Edit `backend/db/query.sql`, then regenerate.
sqlc's Postgres engine does not run on native Windows, so use WSL:

```bash
wsl -d Ubuntu -- bash -c "cd /mnt/c/Users/Ziagu/Stackhub_2/backend && ~/bin/sqlc generate"
# binary (once): sqlc v1.21.0 linux_amd64 into ~/bin (not /tmp, WSL wipes it)
```

Then `go build ./...` and fix handlers that used a changed field.

Gotchas (sqlc v1.21):
- **`sqlc generate` exits 0 even when the Go it produced does not parse** — it
  writes nothing. Check that `pkg/db` actually changed. Usual cause: a column
  named after a Go keyword (`SELECT type …`); alias it.
- Prefer named params (`sqlc.arg(x)`); a bare `$2` becomes `Column2`. Do not mix
  `$1` and `sqlc.arg()` in one query.
- `CASE` → `interface{}`, `NULLIF` → `bool`, `COALESCE` → non-null type, and a
  `UNION` takes its types from the **first branch only**. A UUID in an
  `interface{}` serialises as a byte array. Read the generated `…Row` struct after
  any complex query change.
- Selecting from a view with an alias: qualify `WHERE twd.id = $1`, or sqlc
  reports the column as ambiguous.
- `SELECT *` is expanded at generate time: regenerate after a migration adds a column.
- `auth.users` is Supabase's; it is declared for the analyser in
  `db/sqlc-stubs/auth.sql`, never applied.

## Deploy — always migration → backend → frontend

1. **Migration:** there is **no migration runner**. Paste only the `-- +goose Up`
   section (without the goose comment lines) into the Supabase SQL editor.
   **Do not paste the Down section: it is plain SQL and will run and undo the Up.**
   Verify it applied.
2. **Backend:** VPS: `git pull`, `go build -o server ./cmd/server`, restart the
   tmux session. (No sudo; a crontab `@reboot` line restarts it after reboots.)
3. **Frontend:** push to `main`; Vercel builds. `NEXT_PUBLIC_*` vars are baked in
   at build time, so set them before the build.

Backend before its migration 404s every affected page (has happened). The reverse
order is safe. Public API responses are cached up to ~5 min (`httpx.CachePublic`),
so a change can take a few minutes to show.

## Security-relevant facts

- **`/admin` has NO role check.** The backend `/admin` group is just the
  authenticated group, and `frontend/app/admin/layout.tsx` carries a TODO. Any
  signed-in user can resolve or reject tool tickets. It is a UI convention, not a
  boundary: **do not add privileged capabilities behind it** until a real role exists.
- Privileged work runs out of band through `frontend/scripts/*.mjs` with the
  Supabase **service-role key** (bypasses RLS), run by hand, never served. Only
  `app/api/claim/route.ts` and `app/auth/callback/route.tsx` use that key inside
  the app, for account claims.
- **The repo is public.** No secrets, no personal emails in committed files.
  Generated data goes in gitignored `frontend/scripts/enrichment/`.
- Never read `.env*` files or print secret values.

## Hidden tools

`tools.hidden_at` (NULL = visible) and `tools.hidden_batch` (label, e.g.
`2026-11-client-curation`). Nothing is deleted: posts, stacks, follows and owners
keep pointing at hidden tools.

- **Any query that lists tools publicly must filter `hidden_at IS NULL`.** Search
  (and its facet count), autocomplete, `/tools`, category pages and counts,
  popular/recommended tools and onboarding already do.
- A hidden tool's page still loads, with `is_hidden: true`, and asks search
  engines not to index it. User stacks/watchlists/follows still show hidden tools.
- **Nothing over HTTP un-hides a tool.** Only `frontend/scripts/hide-tools.mjs`
  (`UNHIDE_BATCH=<label>` or `UNHIDE_NAMES="A,B"`, dry run unless `APPLY=1`).
  Approving a ticket with a hidden tool links it but leaves it hidden; resolve-new
  refuses a name whose URL slug is already taken.

## Frontend

- Pre-flight before calling work done: `npx tsc --noEmit`, `npx next lint`,
  `npm run build`. ESLint failures fail the Vercel build and `tsc` misses them.
- Server state goes through React Query hooks in `lib/queries/`. For a mutation
  that invalidates caches, copy `useCreatePost` in `lib/queries/use-post-actions.ts`.
  Query keys are inconsistent (some invalidate broad `["posts"]`): check before
  assuming a narrow key is enough.
- Drafts vs published: `posts.draft_content` is the working copy, `content` the
  published one; publish copies draft → content.

## Environment variables (names only)

- **Backend:** `DB_CONNECTION`, `JWT_SECRET`, `SUPABASE_PROJECT_REF`,
  `RESEND_API_KEY`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`,
  `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
- **Frontend:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (server-only: `SUPABASE_SERVICE_ROLE_KEY`)
- **Scripts:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BRIGHTDATA_TOKEN`

## Key commands

```bash
cd backend  && go run ./cmd/server          # the PACKAGE, not main.go alone
cd backend  && go build ./... && go vet ./... && go test ./...
cd frontend && npm run dev | npm run build | npm run lint
.\run-local.ps1                              # local stack, see LOCAL-DEV.md
```

`/ship` (`.claude/commands/ship.md`) runs the code → verify → fix loop, sized to
the change (Small / Normal / Feature).

## Code style

- **Go:** `log.Println(err)` before returning an error; `defer tx.Rollback(ctx)`
  after every `Begin`; right HTTP status codes; `pgtype` for nullable fields.
- **TypeScript:** `async/await` over `.then`; destructure props; React Query for
  all server state; small single-purpose components; `toast` from sonner for
  user feedback.

## Understanding the code: use the graph first

If you need help understanding how something works or where it lives, **query
the Graphify graph first** (`graphify-out/`, gitignored), and only then grep or
read files: `graphify query "<question>"`, `graphify path "<A>" "<B>"`,
`graphify explain "<concept>"`. The graph points you at files; **edit code from
the real files, not the graph**, and verify what it claims before relying on it.
Rebuild it if it looks stale: `graphify update .` (code only, no model cost) or
`/graphify .` for a full rebuild including docs. Frontend graph rules are in
`frontend/CLAUDE.md`.
