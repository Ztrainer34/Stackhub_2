# Handoff — state at end of session (2026-11-09)

Read `CLAUDE.md` first. This file is only what is NOT in the code, git or CLAUDE.md.

## Where things stand

- **Hidden tools: LIVE.** Migration applied in prod, backend + frontend pushed
  ("hide tools", "hide 2"), hide script run: the site shows ~1,137 tools (was 16,733).
- **Client bulk-import: being set up.** Client will run `frontend/scripts/seed.mjs`
  himself with Claude and the service-role key (owner's call). Guide written:
  `frontend/scripts/IMPORT-GUIDE.md` (run steps + "skip tools not on StackHub").
- **Uncommitted right now:** IMPORT-GUIDE.md, `.gitignore` (graphify-out/),
  README.md (Lexical/RBAC claims fixed), `.claude/agents/test-author.md` and
  `test-runner.md` (stale Go/sqlc claims fixed), plus `CLAUDE.md` and this file.
- **Graphify graph built** (`graphify-out/`, gitignored, 549 files). Not yet used much.

## Unfinished / next steps

1. **DONE (user confirmed):** the 268 new tools are imported and both fill files
   are applied (`2026-11-08-new269.overrides.json`, then `…vendor.overrides.json`),
   and so are the 68 popular-GTM overrides (`2026-11-06-popular-gtm.overrides.json`).
2. **`seed.mjs` has no `APPLY=1` step** — it writes to the live DB immediately.
   Offered adding one (so the client's first run is not also his first write); undecided.
3. **13 client-list tools still not on StackHub** (client expects them): Salesforce,
   AWS, Adobe, Amazon S3, Photoshop, Pitch, Duo by Amplemarket, FLUX Kontext,
   Minerva, Outreach Magic, Ark, Poly Haven, Pulse Recruit. Only sub-products or
   different products with similar names exist.
4. Gaps left on the 268 after applying: 27 have no website, 12 no category, 18 are
   name-only pages, 40 no logo (19 of those have a website and are fixable:
   DeepSeek, Krea, the Google apps…). Company details: HQ 193, year 180, LinkedIn
   141, X 92 of 268; 52 tools have none.
5. **Check in the Supabase dashboard** that `anon`/`authenticated` cannot UPDATE or
   SELECT `tools` directly via PostgREST (could bypass hiding). Never verified.
6. Optional: real admin role (`profiles.is_admin`, granted by script) + an admin
   import page (~1 day). Would close the open `/admin` hole and give the client a
   browser import with no key on his machine. Discussed, not built.

## Decisions made here that are not in the code

- **What stays visible:** the client's 1,107-tool list (resolves to 1,113 rows:
  umbrella names like "Zoom" keep the whole family) **plus every tool used in any
  post**, test playbooks included. Stacks/follows are ignored because real users
  only hold kept tools; other users are test accounts. Luma, Swan and Scrape were
  unclear matches and are kept visible. The keep-list lives in
  `frontend/scripts/enrichment/keep-list.json` (gitignored).
- **Un-hiding is script-only.** Approving a ticket with a hidden tool must not
  un-hide it: `/admin` has no role check, so any signed-in user could undo the
  curation. The first security review blocked on exactly that.
- **"Findy (Jason AI)" was NOT imported** — same product as "Jason AI SDR".
- **All other tools were imported even without a website/category** (user chose
  that over holding them back).
- **The user runs every service-role command; I never touch the key.** Claude
  prepares files and commands only.
- **tool-enricher agent stays on Sonnet** (user declined Haiku). After a usage
  limit mid-run the agents proposed many websites from memory; the verifier
  re-checked each on a live page and kept company details only when two sources agreed.
- **Hidden-tool pages still load** (old links, playbooks) but are `noindex`.

## Gotchas we already paid for

- **Migration paste:** the user pasted Up **and** Down; Down is plain SQL and ran.
  Always paste only the Up section.
- **Local Supabase rejects service keys** (`PGRST301`): neither `supabase status`
  keys nor a hand-signed HS256 JWT work (`supabase/signing_keys.json` is ~4 bytes).
  `hide-tools.mjs` was therefore tested against an in-memory fake, never a real
  Supabase. Its first real run was the user's.
- **Windows/Git Bash:** the working tree is CRLF (`autocrlf`). `sed -i` strips CRs;
  heredocs mangle backslashes (use the Write tool or a script file); appending
  LF lines to a CRLF Go file makes `gofmt -l` flag it; `gofmt -l` flags every file
  here, so only format files you wrote. Do mutation runs with a checksum before
  and after.
- **Parallel agents share the scratchpad:** give helper scripts unique names (one
  batch ran another agent's script and rewrote its output).
- **Bright Data:** the US pool is blocked; the Unlocker hangs often. Leftover
  `enrich-g2.mjs` / `fetch-page.mjs` node processes keep spending credit — kill them.
- **Graphify:** `.sql` needs `uv tool install "graphifyy[sql]"`. Its answer to
  "who uses supabase-js directly" was diffuse; real answer (grep): the browser
  never touches tables, only `app/api/claim` and `app/auth/callback` use the
  service-role key in-app, plus 19 scripts. Verify graph claims.
- **Hide script:** draft posts keep a tool visible and any signed-in user can create
  drafts; the dry run prints an "ONLY in drafts" line — read it before `APPLY=1`.
- Longer notes are in the project memory dir (`~\.claude\projects\…\memory\`).
