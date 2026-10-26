import { timingSafeEqual } from "node:crypto";

/**
 * Server-only. Decides whether a claim-link submission may go ahead.
 *
 * The token stays live until the claimant first signs in, so a mistyped email
 * can be corrected by submitting again. Before October 2026 that window was
 * open to anyone holding the link: a forwarded invite let a second person
 * submit their own address, and the last submission won the account.
 *
 * The first submission now records a random nonce on the claim and gives the
 * same browser a cookie holding it. Later submissions must present that
 * cookie, so the original claimant can still fix a typo and nobody else can
 * take over. A claim is also refused once the account has been signed in to:
 * at that point it belongs to someone, whichever way they signed in.
 */

export const CLAIM_NONCE_COOKIE = "stackhub_claim_nonce";

export type ClaimRow = {
  claimed_at: string | null;
  expires_at: string | null;
  claimant_nonce: string | null;
};

export type ClaimRejection = { status: number; error: string };

export function claimRejection({
  claim,
  now,
  lastSignInAt,
  cookieNonce,
}: {
  claim: ClaimRow | null;
  now: Date;
  lastSignInAt: string | null | undefined;
  cookieNonce: string | null | undefined;
}): ClaimRejection | null {
  if (!claim) {
    return { status: 404, error: "This invite link isn't valid." };
  }
  if (claim.claimed_at) {
    return { status: 409, error: "This account has already been claimed." };
  }
  if (claim.expires_at && new Date(claim.expires_at) < now) {
    return { status: 410, error: "This invite link has expired." };
  }
  if (lastSignInAt) {
    return {
      status: 409,
      error: "This account is already in use. Ask for a new invite link if you think this is a mistake.",
    };
  }
  if (claim.claimant_nonce && !sameSecret(claim.claimant_nonce, cookieNonce)) {
    return {
      status: 409,
      error:
        "This invite has already been started in another browser. Open it in the browser you used first, or ask for a new link.",
    };
  }
  return null;
}

/** Constant-time comparison, so the nonce cannot be guessed byte by byte. */
function sameSecret(expected: string, given: string | null | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
