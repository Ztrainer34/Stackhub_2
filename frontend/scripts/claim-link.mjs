/**
 * Generates a single-use claim link for an EXISTING account.
 *
 * Send the printed link to a client: it opens that account's profile with a
 * popup asking for their email. Once they submit, the account becomes theirs
 * and they get a magic link to sign in.
 *
 *   SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
 *   node scripts/claim-link.mjs bob
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://stackhub.me";
const EXPIRY_DAYS = Number(process.env.EXPIRY_DAYS || 30);

const username = (process.argv[2] || "").toLowerCase();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}
if (!username) {
  console.error("Usage: node scripts/claim-link.mjs <username>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: profile, error } = await supabase
  .from("profiles")
  .select("id, username")
  .eq("username", username)
  .maybeSingle();

if (error || !profile) {
  console.error(`No account found with username "${username}".`);
  process.exit(1);
}

const token = randomBytes(24).toString("base64url");
const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 864e5).toISOString();

const { error: insertError } = await supabase
  .from("account_claims")
  .insert({ token, user_id: profile.id, expires_at: expiresAt });

if (insertError) {
  console.error("Could not create claim token:", insertError.message);
  process.exit(1);
}

console.log(`\nClaim link for @${profile.username} (valid ${EXPIRY_DAYS} days, single use):\n`);
console.log(`${SITE_URL}/${profile.username}?claim=${token}\n`);
