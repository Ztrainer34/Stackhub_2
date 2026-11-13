// @vitest-environment node
// claim-guard is a server-only module (it uses node:crypto), so it is tested in
// the node environment rather than the jsdom default from vitest.config.ts.
import { describe, it, expect } from "vitest";
import { claimRejection, CLAIM_NONCE_COOKIE } from "@/lib/claim-guard";

/**
 * Decides whether a submission of an account-claim invite may proceed. The
 * checks run in a fixed order and the first failure wins, so which message a
 * caller sees for a doubly-bad claim is itself behaviour worth pinning.
 */

const NOW = new Date("2026-10-16T12:00:00.000Z");
const PAST = "2026-10-15T12:00:00.000Z";
const FUTURE = "2026-10-17T12:00:00.000Z";
const NONCE = "abcdef0123456789abcdef0123456789";

type Claim = {
  claimed_at: string | null;
  expires_at: string | null;
  claimant_nonce: string | null;
};

// A fresh, valid, never-submitted invite. Every test overrides only the field
// it is about, so a failure points at that field.
function claim(overrides: Partial<Claim> = {}): Claim {
  return { claimed_at: null, expires_at: FUTURE, claimant_nonce: null, ...overrides };
}

function check(
  overrides: {
    claim?: Claim | null;
    now?: Date;
    lastSignInAt?: string | null;
    cookieNonce?: string | null;
  } = {},
) {
  return claimRejection({
    claim: claim(),
    now: NOW,
    lastSignInAt: null,
    cookieNonce: null,
    ...overrides,
  });
}

describe("CLAIM_NONCE_COOKIE", () => {
  it("is a non-empty string", () => {
    expect(typeof CLAIM_NONCE_COOKIE).toBe("string");
    expect(CLAIM_NONCE_COOKIE.length).toBeGreaterThan(0);
  });
});

describe("claimRejection", () => {
  describe("a valid first submission", () => {
    it("is allowed", () => {
      expect(check()).toBeNull();
    });

    it("is allowed when the invite never expires (expires_at null)", () => {
      expect(check({ claim: claim({ expires_at: null }) })).toBeNull();
    });

    it("is allowed when lastSignInAt is undefined rather than null", () => {
      expect(
        claimRejection({ claim: claim(), now: NOW, lastSignInAt: undefined, cookieNonce: undefined }),
      ).toBeNull();
    });

    it("is allowed with no bound nonce, whatever cookie the browser sends", () => {
      // First submission: nothing is bound yet, so a stray cookie is irrelevant.
      expect(check({ cookieNonce: "something-unrelated" })).toBeNull();
    });
  });

  describe("unknown invite", () => {
    it("is a 404 when there is no claim", () => {
      expect(check({ claim: null })).toEqual({
        status: 404,
        error: "This invite link isn't valid.",
      });
    });
  });

  describe("already claimed", () => {
    it("is a 409", () => {
      expect(check({ claim: claim({ claimed_at: PAST }) })).toEqual({
        status: 409,
        error: "This account has already been claimed.",
      });
    });

    it("is reported even when the invite has also expired", () => {
      const result = check({ claim: claim({ claimed_at: PAST, expires_at: PAST }) });

      expect(result).toEqual({
        status: 409,
        error: "This account has already been claimed.",
      });
    });
  });

  describe("expiry", () => {
    it("is a 410 when expires_at is before now", () => {
      expect(check({ claim: claim({ expires_at: PAST }) })).toEqual({
        status: 410,
        error: "This invite link has expired.",
      });
    });

    it("is a 410 one millisecond after expiry", () => {
      const expires = "2026-10-16T12:00:00.000Z";
      const result = check({
        claim: claim({ expires_at: expires }),
        now: new Date("2026-10-16T12:00:00.001Z"),
      });

      expect(result?.status).toBe(410);
    });

    it("is NOT expired when expires_at is exactly now", () => {
      // The boundary: a link is valid up to and including its expiry instant.
      expect(check({ claim: claim({ expires_at: NOW.toISOString() }) })).toBeNull();
    });

    it("is NOT expired one millisecond before expiry", () => {
      expect(
        check({
          claim: claim({ expires_at: "2026-10-16T12:00:00.001Z" }),
          now: NOW,
        }),
      ).toBeNull();
    });

    it("never expires when expires_at is null, however late now is", () => {
      expect(
        check({
          claim: claim({ expires_at: null }),
          now: new Date("2099-01-01T00:00:00Z"),
        }),
      ).toBeNull();
    });

    it("is reported before the account-in-use check", () => {
      const result = check({
        claim: claim({ expires_at: PAST }),
        lastSignInAt: PAST,
      });

      expect(result?.status).toBe(410);
    });
  });

  describe("account already signed in to", () => {
    it("is a 409 mentioning 'already in use'", () => {
      const result = check({ lastSignInAt: PAST });

      expect(result?.status).toBe(409);
      expect(result?.error).toContain("already in use");
    });

    it("rejects even the browser that holds the matching nonce", () => {
      // Once someone has signed in, the invite must stop working for everyone,
      // including the browser that started the claim.
      const result = check({
        claim: claim({ claimant_nonce: NONCE }),
        cookieNonce: NONCE,
        lastSignInAt: PAST,
      });

      expect(result?.status).toBe(409);
      expect(result?.error).toContain("already in use");
    });

    it("is reported in preference to a wrong-browser rejection", () => {
      const result = check({
        claim: claim({ claimant_nonce: NONCE }),
        cookieNonce: "different-nonce",
        lastSignInAt: PAST,
      });

      expect(result?.error).toContain("already in use");
      expect(result?.error).not.toContain("another browser");
    });

    it("is not triggered by a null lastSignInAt", () => {
      expect(check({ lastSignInAt: null })).toBeNull();
    });
  });

  describe("claim bound to a browser", () => {
    const bound = () => claim({ claimant_nonce: NONCE });

    it("allows the same browser to submit again (correcting a typo)", () => {
      expect(check({ claim: bound(), cookieNonce: NONCE })).toBeNull();
    });

    it("rejects a missing cookie with a 409 mentioning 'another browser'", () => {
      const result = check({ claim: bound(), cookieNonce: null });

      expect(result?.status).toBe(409);
      expect(result?.error).toContain("another browser");
    });

    it("rejects an undefined cookie the same way", () => {
      const result = check({ claim: bound(), cookieNonce: undefined });

      expect(result?.status).toBe(409);
      expect(result?.error).toContain("another browser");
    });

    it("rejects an empty-string cookie", () => {
      const result = check({ claim: bound(), cookieNonce: "" });

      expect(result?.error).toContain("another browser");
    });

    it("rejects a different cookie of the same length", () => {
      const wrong = NONCE.slice(0, -1) + (NONCE.endsWith("9") ? "8" : "9");

      expect(wrong).toHaveLength(NONCE.length);
      expect(check({ claim: bound(), cookieNonce: wrong })?.error).toContain("another browser");
    });

    it("rejects a cookie that is a prefix of the real nonce", () => {
      // Length matters: a truncated nonce must not match.
      const result = check({ claim: bound(), cookieNonce: NONCE.slice(0, -1) });

      expect(result?.error).toContain("another browser");
    });

    it("rejects a cookie that is the real nonce plus extra characters", () => {
      const result = check({ claim: bound(), cookieNonce: NONCE + "x" });

      expect(result?.error).toContain("another browser");
    });

    it("compares case-sensitively", () => {
      const result = check({ claim: bound(), cookieNonce: NONCE.toUpperCase() });

      expect(result?.error).toContain("another browser");
    });
  });

  describe("precedence", () => {
    it("reports 'not valid' over everything else when the claim is null", () => {
      expect(
        check({ claim: null, lastSignInAt: PAST, cookieNonce: "x" })?.status,
      ).toBe(404);
    });

    it("reports 'already claimed' over in-use and wrong-browser", () => {
      const result = check({
        claim: claim({ claimed_at: PAST, claimant_nonce: NONCE }),
        lastSignInAt: PAST,
        cookieNonce: "wrong",
      });

      expect(result?.error).toBe("This account has already been claimed.");
    });
  });
});
