---
description: Run the code → verify → fix loop on the current change, bounded at 3 attempts.
argument-hint: [what you changed, or leave blank to infer from the diff]
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Agent
---

Run the StackHub development loop for: $ARGUMENTS

Current state:
!`git --no-pager diff --stat HEAD`
!`git status --porcelain`

## The loop

**1. Implement.** Make the change. One concern at a time.

**2. Cover it, if it has testable logic.** If the change added or changed a pure
function or a component's behaviour in `frontend/`, call the `test-author`
subagent — then call `test-verifier` on what it wrote.

Give `test-author` the **specification**, not the diff: what the thing should do,
its edge cases, what should happen when input is empty or malformed. It
deliberately does not read implementations, because a test written from the code
just transcribes the code's bugs.

`test-verifier` then breaks the source on purpose and confirms the new tests go
red. If it reports **NOT VERIFIED**, the tests are decoration — send them back to
`test-author` with what the verifier found.

Skip both for changes with no testable logic: styling, copy, config, docs,
backend-only work.

**3. Verify.** Call the `test-runner` subagent. It runs typecheck, tests, lint
and the production build from `frontend/`, and reports failures with `file:line`.

**4. Fix and repeat.** Go back to step 3 after each fix.

**Stop after 3 failed attempts.** Do not keep going. Report what is still red,
what you tried, and hand back. An unbounded loop on a problem the model cannot
solve burns an hour and a lot of tokens to arrive at the same place.

**5. Look at it — but only when the change is visual.** Call the `ui-reviewer`
subagent when **both** hold:

- the change touched files under `frontend/app/` or `frontend/components/`, and
- the local dev server answers on `http://localhost:3000`

Skip it otherwise. A browser review of a backend, script or docs change is pure
cost, and `ui-reviewer` cannot review a server that is not running — it will say
so and stop, which wastes a turn.

Its findings are **advisory**. Fix what is genuinely broken; for anything that is
a matter of taste, report it and let the user decide. Never treat it as a gate:
`test-runner` is the gate, and a screenshot is a second opinion.

**6. Record, but only sometimes.** If a failure had a cause that a future session
would plausibly hit again — a constraint of this codebase, not a slip — call the
`memory-keeper` subagent. Do not call it for typos. A memory directory full of
noise is read by nobody.

**7. Hand back.** Do not commit, push or deploy. Deployment order here is strictly
migration (Supabase SQL editor) → backend (VPS) → frontend (Vercel push), and it
is the user's call when to start it.

**If the change touches a migration or `backend/`, say so in bold in your final
message**, and name the migration file. Shipping the backend before its migration
has 404'd this site before.

## What the gate does not cover

`test-runner` can only see the frontend. There is no Go toolchain on this machine,
so backend code is not compiled until it reaches the VPS — and a SQL error inside
a query string compiles fine there too, surfacing only as a 500 at runtime.

For backend changes, read the diff yourself with that in mind. Specifically:
`backend/db/query.sql` and `backend/pkg/db/query.sql.go` are hand-maintained in
parallel, and the `rows.Scan` order must match the SELECT column order exactly or
rows come back shifted with no error at all.
