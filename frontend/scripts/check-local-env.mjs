/**
 * Preflight: proves you are pointed at the local stack and not at production.
 *
 * Running the app locally cannot deploy anything — there is no push, no VPS, no
 * Vercel build in the loop. The only way production gets touched is a
 * production credential sitting in a local env file or, far more likely, left
 * over in the shell from an earlier script run. This checks both.
 *
 * A hosted Supabase project is always <ref>.supabase.co. The local stack is
 * always 127.0.0.1 / localhost. That single distinction is the whole test.
 *
 * READ ONLY — reads files and env vars, changes nothing, connects to nothing.
 *
 *   node scripts/check-local-env.mjs
 *
 * Exits 0 if everything points local, 1 if anything points at production.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOSTED = /\.supabase\.co/i;
const LOCAL = /127\.0\.0\.1|localhost/i;

const problems = [];
const good = [];
const notes = [];

/** Parses KEY=value lines; ignores comments and blanks. */
function readEnv(relPath) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return null;
  const out = {};
  for (const line of readFileSync(full, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Never print a secret — just enough of a URL to recognise the project. */
function safeShow(value) {
  const host = value.match(/https?:\/\/([^/\s]+)/);
  if (host) return host[1];
  const pg = value.match(/@([^/\s:]+)/); // postgresql://user:pass@HOST/db
  if (pg) return `(db host) ${pg[1]}`;
  return "(value hidden)";
}

function checkVar(where, key, value) {
  if (!value) return;
  if (HOSTED.test(value)) {
    problems.push(`${where} → ${key} points at a HOSTED Supabase project: ${safeShow(value)}`);
  } else if (LOCAL.test(value)) {
    good.push(`${where} → ${key} is local: ${safeShow(value)}`);
  }
}

/**
 * "Exists but holds nothing" is its own failure, and a quiet one: with no
 * variables to check, everything below passes and the report looks clean.
 * Called out separately from a missing file.
 */
function checkUsable(env, relPath, expected, consequence) {
  if (!env) {
    notes.push(`${relPath} does not exist yet — ${consequence}`);
    return false;
  }
  if (Object.keys(env).length === 0) {
    problems.push(
      `${relPath} exists but is EMPTY — no KEY=value lines parsed. ${consequence} ` +
        `(If you pasted into it, the file may not have been saved.)`
    );
    return false;
  }
  const missing = expected.filter((k) => !env[k]);
  if (missing.length) {
    problems.push(`${relPath} is missing: ${missing.join(", ")}`);
  }
  return true;
}

// ---- env files -------------------------------------------------------------
const frontend = readEnv("frontend/.env.local");
if (
  checkUsable(
    frontend,
    "frontend/.env.local",
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_API_URL"],
    "the frontend will not boot."
  )
) {
  checkVar("frontend/.env.local", "NEXT_PUBLIC_SUPABASE_URL", frontend.NEXT_PUBLIC_SUPABASE_URL);
  checkVar("frontend/.env.local", "NEXT_PUBLIC_API_URL", frontend.NEXT_PUBLIC_API_URL);
}

const backend = readEnv("backend/.env");
if (
  checkUsable(
    backend,
    "backend/.env",
    ["DB_CONNECTION", "JWT_SECRET", "S3_ENDPOINT", "S3_BUCKET_NAME"],
    "the server will panic on startup."
  )
) {
  checkVar("backend/.env", "DB_CONNECTION", backend.DB_CONNECTION);
  checkVar("backend/.env", "S3_ENDPOINT", backend.S3_ENDPOINT);
  if (backend.SUPABASE_PROJECT_REF && backend.SUPABASE_PROJECT_REF !== "local") {
    notes.push(
      `backend/.env → SUPABASE_PROJECT_REF is "${backend.SUPABASE_PROJECT_REF}", not "local". ` +
        `Harmless for testing (it only builds storage URLs, which do not resolve locally anyway), ` +
        `but it is a production project ref sitting in a local file.`
    );
  }
  if (backend.RESEND_API_KEY && !/dummy|test|local/i.test(backend.RESEND_API_KEY)) {
    problems.push(
      "backend/.env → RESEND_API_KEY looks like a real key. Local notifications would send REAL email."
    );
  }
}

// ---- the shell: the one that actually catches people ------------------------
for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DB_CONNECTION"]) {
  const value = process.env[key];
  if (!value) continue;
  if (HOSTED.test(value)) {
    problems.push(
      `SHELL → ${key} is set to a HOSTED project: ${safeShow(value)}. ` +
        `Any script run in this terminal writes to PRODUCTION.`
    );
  } else if (LOCAL.test(value)) {
    good.push(`SHELL → ${key} is local: ${safeShow(value)}`);
  } else if (key === "SUPABASE_SERVICE_ROLE_KEY") {
    notes.push(
      "SHELL → SUPABASE_SERVICE_ROLE_KEY is set but its target cannot be told from the key alone. " +
        "Check SUPABASE_URL in the same terminal."
    );
  }
}

// ---- report ----------------------------------------------------------------
console.log("");
if (good.length) {
  console.log("Pointing at local:");
  for (const g of good) console.log(`  ok   ${g}`);
  console.log("");
}
if (notes.length) {
  console.log("Notes:");
  for (const n of notes) console.log(`  --   ${n}`);
  console.log("");
}

if (problems.length) {
  console.log("PRODUCTION EXPOSURE:");
  for (const p of problems) console.log(`  !!   ${p}`);
  console.log("");
  console.log("Fix before running anything that writes. Open a fresh terminal to clear");
  console.log("shell variables — they persist for the whole session.");
  process.exit(1);
}

console.log("No production credentials found in local env files or this shell.");
console.log("Running the app cannot deploy: no push, no VPS, no Vercel build is involved.");
process.exit(0);
