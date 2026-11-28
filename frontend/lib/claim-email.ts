/**
 * Validation for the account-claim dialog's two email fields.
 *
 * Claiming attaches an address to an existing account and sends a sign-in link
 * there, so a mistyped address does more than inconvenience someone: typed into
 * a real stranger's address, it mails them a working link into an account that
 * was never theirs. The confirmation field is the cheap half of guarding
 * against that; the other half is that the claim is not finalised until the
 * link is actually clicked.
 *
 * Comparison is trimmed and case-insensitive. The local part of an address is
 * technically case-sensitive, but no mail provider in practice treats
 * You@Company.com and you@company.com as different people, and rejecting that
 * pair would read as a bug to the person typing it.
 */

/** Deliberately loose — the real check is whether the sign-in link arrives. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Returns an error message for the first problem found, or null when the pair
 * is good. Messages are user-facing and name the field they belong to.
 */
export function validateClaimEmails(
  email: string,
  confirmEmail: string
): string | null {
  const primary = normaliseEmail(email);
  const confirmation = normaliseEmail(confirmEmail);

  if (primary === "") return "Enter your email address.";
  if (!EMAIL_SHAPE.test(primary)) return "Enter a valid email address.";

  if (confirmation === "") return "Confirm your email address.";

  // Checked after the empty case so someone who has typed nothing in the second
  // field is told to fill it in, not that it fails to match.
  if (primary !== confirmation) return "The two email addresses don't match.";

  return null;
}
