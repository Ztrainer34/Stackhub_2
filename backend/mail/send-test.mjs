/**
 * Sends a generated email template to a real inbox so you can check how it
 * renders in an actual mail client (Gmail strips CSS that a browser keeps).
 *
 * No dependencies — plain fetch against the Resend API.
 *
 *   RESEND_API_KEY="re_..." TO="you@example.com" node mail/send-test.mjs
 *   RESEND_API_KEY="re_..." TO="you@example.com" TEMPLATE=welcome node mail/send-test.mjs
 *
 * Run from the backend/ directory.
 */
import { readFileSync } from "node:fs";

const KEY = process.env.RESEND_API_KEY;
const TO = process.env.TO;
const TEMPLATE = process.env.TEMPLATE || "welcome";
const FROM = process.env.FROM || "StackHub <welcome@stackhub.me>";

if (!KEY || !TO) {
  console.error("Usage: RESEND_API_KEY=re_... TO=you@example.com node mail/send-test.mjs");
  console.error("  (RESEND_API_KEY is the same one the backend uses)");
  process.exit(1);
}

const path = `mail/generated/${TEMPLATE}.html`;
let html;
try {
  html = readFileSync(path, "utf8");
} catch {
  console.error(`Could not read ${path} — run this from the backend/ directory.`);
  process.exit(1);
}

// The Go mailer fills Go template variables; none are used by welcome.html
// today, but strip any leftovers so they don't show up as literal text.
html = html.replace(/\{\{\s*\.\w+\s*\}\}/g, "");

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: FROM,
    to: [TO],
    subject: `[TEST] ${TEMPLATE} — StackHub`,
    html,
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Failed (${res.status}):`, body.message || body);
  process.exit(1);
}
console.log(`Sent "${TEMPLATE}" to ${TO}  (id: ${body.id})`);
