# Importing users and playbooks into StackHub

Run from the `frontend/` folder, once your import JSON is ready
(format: `scripts/seed-data.example.json`).

## What an import does

An import only **adds**. It never deletes, and it never touches users or
playbooks that are not in the file.

**Each user needs their own email.** Use an alias of one inbox plus the
username, e.g. `inbox+alicemartin@example.com`. A file where users share an email
is refused: they would all be merged into one account.

| The user in the file… | What happens |
|---|---|
| matches no account | Account, profile and tool lists are created. |
| has the **same email and the same username** as an account | Existing user: the profile and tool lists are **left exactly as they are**. The file's playbooks are added to that account. |
| has an email that already belongs to a **different username** | Skipped, with all their playbooks. Listed in the preview. |
| has a username already taken by **another account** | Skipped, with all their playbooks. Listed in the preview. |

| The playbook… | What happens |
|---|---|
| is new | Created. |
| has the same author and title as one already on StackHub | Skipped. It is **not updated**: edit existing playbooks on the site. |
| has a skipped author | Skipped. |

## Tools that are not on StackHub

Only use tools that already exist on StackHub, named exactly as they appear
there. The import **never creates tools**: an unknown name is shown in the
preview as

```
✗ link skipped: unknown tool Foobar
```

and the playbook is still imported without that tool link.

- If every tool in a playbook would be skipped (`! no tool at all would be
  linked`), leave the whole playbook out. A playbook needs at least one tool (a
  comparison at least two), and one with none looks broken.
- If a name is ambiguous (`✗ link skipped: ambiguous tool Gemini`), use the
  fuller name as shown on the site, or pin the tool by its id:

  ```json
  { "tool_ids": { "Gemini": "<tool uuid>" }, "users": [ ... ] }
  ```

## 1. Check the file (no key needed)

```bash
node scripts/seed.mjs --check scripts/my-import.json
```

Writes nothing and reads no database. Confirms that every user has a valid,
unique email and a valid unique username (`a-z`, `0-9`, `_`, `-`, 3 to 30
characters), that pinned tool ids look right, that no tool sits in two of a
user's lists, and that every playbook body can be shown. Fix any `✗` and re-run.

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

## 3. Preview (dry run)

```bash
node scripts/seed.mjs scripts/my-import.json
```

Reads the database and **writes nothing**. It lists every user and playbook
with what would happen:

| Line | Meaning |
|---|---|
| `+ @alice` | New user, will be created. |
| `= @alice  existing account, profile not changed` | Same email and username: playbooks will be added. |
| `✗ @alice  skipped: …` | Will not be imported (reason given), nor will their playbooks. |
| `+ "Title" by @alice (3 tools)` | Playbook will be created with 3 tool links. |
| `✗ link skipped: unknown tool Foobar` | Not on StackHub, that link is left out. |
| `✗ "Title" … skipped: …` | Playbook will not be imported (reason given). |
| `Hidden tools that would be linked` | These exist but are hidden from listings. |

Read it carefully. Fix the file and preview again until it is what you want.

## 4. Import

> ⚠ There is no undo. This writes to the live database.

```powershell
$env:APPLY = "1"; node scripts/seed.mjs scripts/my-import.json; Remove-Item Env:APPLY
```

```bash
APPLY=1 node scripts/seed.mjs scripts/my-import.json
```

It prints the same preview, then `✓ user @…` and `✓ playbook "…"` as it writes,
and `Done.` at the end. Running it again is safe: what now exists is shown as
existing or skipped, and only what is still missing is added.

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
- **"users share one email".** Give each user their own email (see the top).
- **A tool is in two lists.** Each tool goes in only one of `stack`, `watchlist`
  or `old_stack` per user.
- **`✗ user @…: profile not saved`.** That user's login was removed again and
  their playbooks were not imported. Fix and re-run.
- **Imported something by mistake.** Nothing here deletes anything, so ask your
  developer rather than cleaning up with the key.
