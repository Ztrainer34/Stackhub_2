/**
 * Reads magic-link emails from the local Supabase mail catcher (Mailpit, on
 * :54324 — Supabase CLI 2+ replaced Inbucket with it). Nothing here is ever
 * sent to a real inbox.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitSummary {
  ID: string;
  Created: string;
}

/** A fresh address per call, so runs never see each other's mail or users. */
export function uniqueEmail(prefix = "e2e"): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@local.test`;
}

async function search(email: string): Promise<MailpitSummary[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const resp = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  if (!resp.ok) {
    throw new Error(`Mailpit search failed (${resp.status}). Is Supabase running?`);
  }
  const body = (await resp.json()) as { messages?: MailpitSummary[] };
  return body.messages ?? [];
}

/**
 * Waits for the first email to `email` that arrived after `since`, and returns
 * the Supabase verify link inside it. Pass the time just before the request
 * that sends the mail, so an older link for the same address is never used.
 */
export async function waitForMagicLink(
  email: string,
  since: Date,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Mailpit's timestamps have second precision, so allow a second of slack.
    const fresh = (await search(email)).filter(
      (m) => new Date(m.Created).getTime() >= since.getTime() - 1_000,
    );

    if (fresh.length > 0) {
      const resp = await fetch(`${MAILPIT_URL}/api/v1/message/${fresh[0].ID}`);
      if (!resp.ok) throw new Error(`Mailpit message fetch failed (${resp.status})`);
      const message = (await resp.json()) as { HTML?: string; Text?: string };
      return extractVerifyLink(`${message.HTML ?? ""}\n${message.Text ?? ""}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`No email to ${email} arrived within ${timeoutMs / 1000}s`);
}

/** The GoTrue `/auth/v1/verify` link, HTML entities decoded. */
export function extractVerifyLink(body: string): string {
  const match = body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
  if (!match) throw new Error("The email contains no /auth/v1/verify link");
  return match[0].replace(/&amp;/g, "&");
}
