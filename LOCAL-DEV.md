# Running StackHub on your own machine

This gets you a complete, private copy of StackHub running locally — the website,
the API and the database — so you can click around, create playbooks and break
things without any of it touching the live site.

**Nothing you do here is visible to anyone else.** The database runs on your
machine in Docker. It starts empty and gets filled with a handful of fake users
and tools. No email is ever sent, nothing is published, and no real user can see
any of it.

Expect **45–60 minutes** the first time, most of it waiting for downloads.

---

## What you will be running

Three things, in three terminal windows, all on your own machine:

| What | Where | Started by |
|---|---|---|
| Database, login and file storage | `127.0.0.1:54321` | `npx supabase start` |
| The API (Go) | `localhost:8080` | `run-local.ps1`, or `env $(cat .env | xargs) go run …` |
| The website (Next.js) | `localhost:3000` | `pnpm dev` |

The website talks to the API, and the API talks to the database. If any one of
them is not running, the site shows errors.

---

## Before you start

Install these four. The commands below are the quickest route; the official
installers work equally well.

### 1. Docker Desktop

Runs the database. Download from **https://www.docker.com/products/docker-desktop**

Install it, **launch it**, and wait for the whale icon in your system tray or
menu bar to stop animating. Check it worked:

```bash
docker --version
```

> Docker Desktop must be **running**, not just installed, every time you work on
> this. If it is closed, nothing else below will start.

### 2. Node.js 20 or newer

Runs the website. Download from **https://nodejs.org** (take the LTS version).

```bash
node --version
```

### 3. pnpm

The package manager this project uses. npm will not work — the lockfile is
pnpm's.

```bash
npm install -g pnpm
pnpm --version
```

### 4. Go 1.22 or newer

Runs the API. Download from **https://go.dev/dl/**

```bash
go --version
```

> **Windows:** after installing Go, **close and reopen your terminal**. The
> installer adds Go to your PATH, but an already-open terminal keeps the old one
> and will tell you `go: command not found`.

You do **not** need to install the Supabase CLI — it is run through `npx`.

---

## Step 1 — Get the code

```bash
git clone https://github.com/Ztrainer34/Stackhub_2.git
cd Stackhub_2
```

If you were sent a zip instead, unzip it and `cd` into the folder.

**Everything below runs from inside this folder.** Where a command says
`cd frontend`, that means the `frontend` folder inside it.

---

## Step 2 — Install the website's dependencies

```bash
cd frontend
pnpm install
cd ..
```

Takes a few minutes and downloads a lot. One run is enough.

---

## Step 3 — Start the database

Make sure Docker Desktop is running first, then:

```bash
npx supabase start
```

**The first run downloads about 2 GB of Docker images — allow 10–20 minutes.**
It will look like it has frozen. It has not. Afterwards it takes seconds.

When it finishes it prints a block of values. **Keep this terminal open and keep
that output** — you need four of those values in the next step. You can reprint
them at any time with:

```bash
npx supabase status
```

What it gives you:

| Printed as | What it is |
|---|---|
| `API URL` | `http://127.0.0.1:54321` |
| `DB URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `Studio URL` | `http://127.0.0.1:54323` — browse the database in a web UI |
| `Inbucket URL` | `http://127.0.0.1:54324` — **every email lands here** |
| `anon key` | a long `eyJ...` string |
| `service_role key` | a different long `eyJ...` string |
| `JWT secret` | a long random string |
| `S3 Access Key` / `S3 Secret Key` | for file uploads |

> These are local-only values generated on your machine. They are not secret and
> they give access to nothing but your own copy.

The database schema is created automatically — there is nothing to run by hand.

---

## Step 4 — Create two settings files

Neither exists yet. Create both, copying values from the `npx supabase status`
output above.

### `frontend/.env.local`

Create a new file at exactly that path, containing:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste the anon key>
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### `backend/.env`

Create a new file at exactly that path, containing:

```
DB_CONNECTION=postgresql://postgres:postgres@127.0.0.1:54322/postgres
JWT_SECRET=<paste the JWT secret>
SUPABASE_PROJECT_REF=local
S3_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3
S3_REGION=local
S3_ACCESS_KEY=<paste the S3 Access Key>
S3_SECRET_ACCESS_KEY=<paste the S3 Secret Key>
S3_BUCKET_NAME=images
RESEND_API_KEY=re_dummy_value_not_used_locally
```

Replace each `<...>` including the angle brackets. No quotes, no spaces around
the `=`.

> **The three most common mistakes here**
>
> 1. **`NEXT_PUBLIC_API_URL` left out.** Every page returns a 500 error, with no
>    clue as to why. It is the single most frequent cause of "it doesn't work".
> 2. **Wrong `JWT_SECRET`.** The API verifies your login token against this
>    exact value. If it does not match, you can log in but every page behaves as
>    though you are logged out, and nothing in the logs explains it.
> 3. **File saved in the wrong place.** `frontend/.env.local`, not
>    `frontend/frontend/.env.local` or the project root. Check the path.

There is a script that checks all of this for you:

```bash
cd frontend
node scripts/check-local-env.mjs
cd ..
```

It prints `ok` per setting, or names what is missing. **Run it before going
further** — it catches all three mistakes above in two seconds.

---

## Step 5 — Add the sample data

The database starts completely empty, so the site has nothing to show and most
pages will 404.

**macOS / Linux:**

```bash
cd frontend
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_SERVICE_ROLE_KEY="<paste the service_role key>" \
node scripts/seed.mjs scripts/seed-data.local.json
cd ..
```

**Windows PowerShell:**

```powershell
cd frontend
$env:SUPABASE_URL = "http://127.0.0.1:54321"
$env:SUPABASE_SERVICE_ROLE_KEY = "<paste the service_role key>"
node scripts/seed.mjs scripts/seed-data.local.json
cd ..
```

Note this uses the **service_role** key, not the anon key — a different value.

You should see it create two users, then tool lists, then three playbooks. That
gives you:

- **alice** and **bob** — two accounts, so you can follow someone and see a feed
- **8 tools** — Clay, Apollo, HubSpot, Lemlist, Notion and others
- **3 playbooks** — written by alice and bob

Two accounts rather than one is deliberate: following, the activity feed and
anything "from someone else" are all invisible with a single user.

---

## Step 6 — Start the API

**Open a second terminal** (leave the first one alone).

**Windows PowerShell:**

```powershell
cd backend
.\run-local.ps1
```

**macOS / Linux:**

```bash
cd backend
env $(cat .env | xargs) go run cmd/server/main.go
```

You want to see:

```
Database: 127.0.0.1:54322
Starting on http://localhost:8080 ...
```

**and nothing after it.** If a block of red text follows, see Troubleshooting.

> **Do not run `go run cmd/server/main.go` on its own.** The server does not read
> `.env` by itself — it reads the environment of whatever started it, and exits
> on the first value it cannot find. The commands above load the file for it.

Leave this terminal running. It prints every request, which is useful when
something misbehaves.

---

## Step 7 — Start the website

**Open a third terminal.**

```bash
cd frontend
pnpm dev
```

Wait for `Ready in ...`, then open **http://localhost:3000**

> **It must be port 3000.** If Next.js says port 3000 was busy and it used 3001,
> stop it, free port 3000, and start again. The login system is configured for
> 3000 specifically, and on any other port logging in fails silently.

> **The first visit to each page takes 20–40 seconds.** Pages are compiled the
> first time they are opened. It looks frozen. Wait. It is instant afterwards.

---

## Step 8 — Log in

This part is not obvious, because **there is no password box.** StackHub emails
you a login link, and locally those emails are captured instead of sent.

1. Go to **http://localhost:3000/login**
2. Click **Continue with email**
3. Enter `alice@local.test` and submit
4. Open a new browser tab at **http://127.0.0.1:54324** — the local mail catcher
5. The email appears within a second or two. Open it and **click the link inside**
6. You are returned to the site, logged in as alice

To look at the site as a different person, repeat with `bob@local.test`.

You can also invent an address — `anything@example.com` — and its mail will
appear in the same place. Nothing is ever sent to a real inbox.

---

## What to look at

**Start by adding two or three tools to your stack** — from Browse tools, or from
any tool's page. The seeded accounts start with empty stacks, so until you do,
the dashboard has nothing personal to recommend and falls back to showing the
newest playbooks. Adding tools is what makes the rest of the site come alive.

Then the parts worth exercising:

- **Home** — your dashboard: trending playbooks picked from the tools in your
  stack, popular tools, and your activity feed
- **Your profile** (top-right menu) — Active stack, Old stack and Saved for
  later. Add tools to each and watch what changes elsewhere
- **Browse tools** — the catalogue, with category filters and search
- **A tool's page** — description, categories, vendor details, "Claim this page"
- **Create a playbook** (the **+** button) — the full compose flow
- **Follow bob** from his profile, then check your feed

Two things that only make sense with both accounts: the **activity feed** fills
up based on who and what you follow, and **claiming a tool page** looks different
depending on whether you own it.

---

## Known limitations

These are expected locally and are **not** bugs worth reporting:

**Uploaded images do not display.** Logo and avatar uploads succeed and are
saved, but the image will not load — the app builds a public URL that only
exists on the real hosting. Pasting an image URL instead works normally.

**There are 8 tools, not 16,000.** The real site has a large catalogue. Search,
filters and pagination will all feel very different here.

**Your real StackHub account does not exist here.** This is a separate world with
its own users. Use `alice@local.test`, `bob@local.test`, or sign up fresh.

**No real emails.** Everything goes to `http://127.0.0.1:54324`.

---

## Troubleshooting

**Every page shows a 500 error**
`NEXT_PUBLIC_API_URL` is missing from `frontend/.env.local`. Add it, then
**restart `pnpm dev`** — that setting is only read at startup, so a refresh will
not pick it up. Run `node scripts/check-local-env.mjs` to confirm.

**`error during connect ... dockerDesktopLinuxEngine`**
Docker Desktop is not running. Start it, wait for the whale icon to settle, and
retry.

**`listen tcp 127.0.0.1:8080: bind: ... address already in use`**
An older copy of the API is still running. Close the terminal it is in, or:
macOS/Linux `lsof -ti:8080 | xargs kill`, Windows PowerShell
`Get-NetTCPConnection -LocalPort 8080 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`

**`go: command not found` right after installing Go**
Close the terminal and open a new one.

**The login link does nothing / returns me to the login page**
Check the site is on port **3000**, not 3001. Also confirm `JWT_SECRET` in
`backend/.env` matches `npx supabase status` exactly.

**No email appears in Inbucket**
Confirm the container is up: `docker ps` should list a name containing
`inbucket`. If not, `npx supabase start` did not finish — run it again.

**Pages are blank or hang on first load**
Normal. First compile per page is 20–40 seconds. Wait.

**I changed backend code and nothing happened**
The API compiles at startup. Stop that terminal and start it again. The website
(`pnpm dev`) does reload automatically; the API does not.

---

## Stopping and starting again

To stop everything: `Ctrl+C` in the website and API terminals, then

```bash
npx supabase stop
```

**Your data is kept.** Next time, you only need:

```bash
npx supabase start                              # terminal 1

cd backend && .\run-local.ps1                   # terminal 2 (Windows)
cd backend && env $(cat .env | xargs) go run cmd/server/main.go   # terminal 2 (macOS/Linux)

cd frontend && pnpm dev                         # terminal 3
```

Steps 1 to 5 are one-time.

> **Never use `npx supabase stop --no-backup`** unless you want to erase
> everything and redo Step 5.

---

## If you get stuck

Note which step you were on, and copy the **exact** error text from the terminal.
The API terminal in particular prints the real cause of most problems — the
browser usually just shows a generic error.
