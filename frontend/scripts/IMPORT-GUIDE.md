# Importing users and playbooks into StackHub

Run from the `frontend/` folder, once your import JSON is ready
(format: `scripts/seed-data.example.json`).

## Tools that are not on StackHub

Only use tools that already exist on StackHub, named exactly as they appear
there. The import **never creates tools**: an unknown name is skipped with a line
like

```
✗ playbook "Some title" references unknown tool Foobar
```

and the user or playbook is still imported without that tool link.

So when a creator's stack or a playbook mentions a tool StackHub does not have,
**leave it out of the file**.

- If every tool in a playbook would be skipped, leave the whole playbook out. A
  playbook needs at least one tool (a comparison at least two), and one with
  none looks broken.
- If a name is ambiguous (`✗ ... ambiguous tool Gemini`), use the fuller name as
  shown on the site, or pin the tool by its id (from the tool page's URL):

  ```json
  { "tool_ids": { "Gemini": "<tool uuid>" }, "users": [ ... ] }
  ```

## 1. Check the file (no key needed)

```bash
node scripts/seed.mjs --check scripts/my-import.json
```

Writes nothing. Confirms usernames are valid (`a-z`, `0-9`, `_`, `-`, 3 to 30
characters), pinned tool ids look right, no tool sits in two of a user's lists,
and every playbook body can be stored. It does **not** check tool names against
the catalog, so unknown tools only show up in step 3.

Fix any `✗` and re-run. Read the list of users and playbook titles carefully:
this is your only preview.

## 2. Set the keys

Supabase → Project Settings → API: the Project URL and the `service_role` key.

```powershell
$env:SUPABASE_URL = "https://<your-project>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key>"
```

```bash
export SUPABASE_URL="https://<your-project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
```

The `service_role` key can read, change and delete everything in the database,
including all accounts. Set it in the terminal only, never in a file in the
project or in a chat with Claude. If it leaks, rotate it in Supabase (the website
uses the same key and will need the new one).

## 3. Import

> ⚠ There is no undo and no second preview. Unlike the other scripts in this
> folder, `seed.mjs` has no `APPLY=1` step: this writes to the live database
> straight away.

```bash
node scripts/seed.mjs scripts/my-import.json
```

| Line | Meaning |
|---|---|
| `✓ user @alice` | Account and profile created. |
| `✓ playbook "..."` | Playbook created. |
| `✗ ... unknown tool Foobar` | Not on StackHub, link skipped. Everything else still imported. |
| `✗ ... ambiguous tool Gemini` | Several tools share that name: use the fuller name or pin the id. |
| `Done.` | Finished. |

Running it twice is safe: existing users are reused, not duplicated.

Afterwards, clear the keys (or close the terminal):

```powershell
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY, Env:SUPABASE_URL
```

```bash
unset SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL
```

## If something goes wrong

- **"Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars."** The keys are not
  set in this terminal. Each new terminal needs step 2 again.
- **A tool is in two lists.** Each tool goes in only one of `stack`, `watchlist`
  or `old_stack` per user.
- **Imported something by mistake.** Nothing here deletes anything, so ask your
  developer rather than cleaning up with the key.
