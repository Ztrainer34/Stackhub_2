import { test, expect, type Page } from "@playwright/test";
import { uniqueEmail, waitForMagicLink } from "./helpers/mailpit";

/**
 * Sign-in is magic-link only: there is no password box. These tests use the
 * real flow end to end — the form calls Supabase Auth, the email lands in the
 * local Mailpit, the browser follows the link through /auth/callback, and the
 * Go API decides (via /me) whether the account still needs onboarding.
 */

const loginButton = (page: Page) =>
  page.getByRole("button", { name: "Login", exact: true });

const landingHero = (page: Page) =>
  page.getByRole("heading", { name: "Discover the best GTM tools and playbooks" });

/** Requests a magic link from /login and returns the link from the email. */
async function requestMagicLink(page: Page, email: string): Promise<string> {
  await test.step("request a magic link on /login", async () => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.getByLabel("Email address").fill(email);
  });

  const since = new Date();
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  return test.step("read the link from the local mail catcher", () =>
    waitForMagicLink(email, since),
  );
}

test.describe("Logged-out visitor", () => {
  test("is sent to /login when opening the composer", async ({ page }) => {
    await page.goto("/new");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
  });

  test("sees the landing page and a Login button", async ({ page }) => {
    await page.goto("/");

    await expect(landingHero(page)).toBeVisible();
    await expect(loginButton(page)).toBeVisible();
  });

  test("an invalid sign-in code lands on the auth error page", async ({ page }) => {
    await page.goto("/auth/callback?code=not-a-real-code");

    await expect(page).toHaveURL(/\/auth\/auth-code-error$/);
    await expect(page.getByRole("heading", { name: "Authentication Error" })).toBeVisible();
  });
});

/**
 * One account through its whole life: sign up, onboard, use a protected page,
 * sign out, sign back in. Serial and sharing one browser context, because each
 * step starts from the state the previous one left.
 */
test.describe.serial("Magic-link account lifecycle", () => {
  const email = uniqueEmail();
  const username = `e2e_${Date.now().toString(36)}`;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("a new user signs up by magic link and completes onboarding", async () => {
    const link = await requestMagicLink(page, email);
    await page.goto(link);

    await test.step("choose a username", async () => {
      await expect(page.getByText("Choose a username")).toBeVisible();
      await page.getByLabel(/how you.ll appear to other people/).fill(username);
      // The Next button enables only once the availability check comes back.
      // `exact`, because `next dev` adds an "Open Next.js Dev Tools" button.
      const next = page.getByRole("button", { name: "Next", exact: true });
      await expect(next).toBeEnabled();
      await next.click();
    });

    await test.step("skip focus areas and finish", async () => {
      await expect(page.getByRole("heading", { name: "What's your focus?" })).toBeVisible();
      await page.getByRole("button", { name: "Skip", exact: true }).click();
      await page.getByRole("button", { name: "Done", exact: true }).click();
    });

    await expect(page.getByText("Welcome to StackHub!")).toBeVisible();
    await expect(loginButton(page)).toBeHidden();
    await expect(landingHero(page)).toBeHidden();
  });

  test("the signed-in user can open a protected page", async () => {
    await page.goto("/new");

    await expect(page).toHaveURL(/\/new$/);
  });

  test("signing out ends the session", async () => {
    await page.goto("/auth/logout");

    await expect(landingHero(page)).toBeVisible();
    await expect(loginButton(page)).toBeVisible();

    await page.goto("/new");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a returning user signs in without seeing onboarding again", async () => {
    const link = await requestMagicLink(page, email);
    await page.goto(link);

    await expect(loginButton(page)).toBeHidden();
    await expect(landingHero(page)).toBeHidden();
    await expect(page.getByText("Choose a username")).toBeHidden();
  });
});
