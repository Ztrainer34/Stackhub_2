# End-to-end tests (Playwright)

Real browser, real stack: Supabase in Docker, the Go API and Next.js. The suite
covers sign-in, which is magic-link only, so the tests read the link from the
local mail catcher (Mailpit, `http://127.0.0.1:54324`) the way a person would
from their inbox.

| File | What it covers |
|---|---|
| `login.spec.ts` | Logged-out redirects, bad sign-in codes, and one account's whole life: sign up, onboard, open a protected page, sign out, sign back in |
| `helpers/mailpit.ts` | Finds the newest magic link for an address |

Every run signs up fresh `e2e-…@local.test` users, so it needs no seed data and
leaves only a few throwaway rows behind in your local database.

## Run locally

Start the stack as in [LOCAL-DEV.md](../../LOCAL-DEV.md) (Supabase, API on
:8080, `pnpm dev` on **:3000**), then:

```bash
cd frontend
npx playwright install chromium   # once
pnpm e2e                          # run the suite
pnpm e2e:report                   # build and open the Allure report
npx playwright show-report        # Playwright's own report, with traces of failures
```

The website must run under `pnpm dev`. Under `next start`,
`app/login/actions.tsx` points magic links at stackhub.me, and sign-in cannot
complete locally.

## In CI

`.github/workflows/e2e.yml` runs on every pull request to `main`, on pushes to
`main` and by hand. It starts Supabase, the API and the website on the runner,
runs Playwright inside the official `mcr.microsoft.com/playwright` image (the
tag follows the installed `@playwright/test` version), and uploads:

- `allure-report` on every run
- `playwright-report` (traces, screenshots, video) and the server logs on failure

To publish the Allure report on GitHub Pages as well, set the repository
variable `ALLURE_PAGES=true` and choose "GitHub Actions" as the Pages source.
The repo is public, so the report will be too. It holds only throwaway test data.

## Writing more tests

- Prefer `getByRole` / `getByLabel` / `getByText` over CSS classes.
- Use `exact: true` for short button names: `next dev` adds an "Open Next.js
  Dev Tools" button, which matches `name: "Next"`.
- Sign in through `requestMagicLink` in `login.spec.ts`, or move it into
  `helpers/` once a second spec file needs it.
