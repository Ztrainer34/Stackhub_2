---
description: Build a new feature: plan with Opus (feature-planner), implement with Sonnet (feature-implementer), then verify with the /ship loop.
argument-hint: [what the feature should do]
allowed-tools: Read, Glob, Grep, Bash, Agent
---

Build this feature: $ARGUMENTS

Current state:
!`git status --porcelain`

## Steps

**1. Plan.** Call the `feature-planner` subagent (Opus) with the feature
description above and anything relevant from this conversation. Do not write
code yourself.

**2. Get the plan approved.** Show the user the plan: summary, open questions,
steps, migration, tier. Stop here and wait.

- If the plan lists **open questions**, put them to the user and re-run the
  planner with their answers.
- If the plan flags a **new trust boundary**, call `security-reviewer` in threat
  model mode with the design before any code is written, and add its
  requirements to the plan.
- Do not move on until the user approves. Plan changes go back to the planner,
  not into the implementer.

**3. Implement.** Call the `feature-implementer` subagent (Sonnet) with the
approved plan **verbatim**, plus any requirements from the security review. If
it reports that the plan does not match the code, take that back to the planner
rather than patching around it.

**4. Verify.** Follow `.claude/commands/ship.md` from step 2 onward, at the tier
the plan named (Feature unless the planner said otherwise). Same 3-attempt cap.

**5. Hand back.** Do not commit, push or deploy. Report the tier used, every
check skipped, and which model did what. If a migration or `backend/` change is
included, say so in bold and name the migration file: deploy order is migration
→ backend → frontend.
