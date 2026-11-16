/**
 * The reason an admin gives when rejecting a suggested tool. It is sent to the
 * person who suggested the tool (in-app and by email).
 *
 * The limits are the backend's (internal/ticket/service.go, validateRejectReason):
 * keep both in step. The backend is the authority; this only saves a round trip.
 */
export const REJECT_REASON_MIN = 10;
export const REJECT_REASON_MAX = 500;

/**
 * The text as the backend will store it: control, format and line/paragraph
 * separator characters (line breaks, bidi overrides, zero-width characters)
 * become spaces, runs of whitespace collapse, and the ends are trimmed.
 */
export function cleanRejectReason(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/**
 * Length in user-perceived characters as the backend counts them: code points
 * of the cleaned text, so an emoji is one, not two UTF-16 units.
 */
export function rejectReasonLength(text: string): number {
  return Array.from(cleanRejectReason(text)).length;
}

/** Why a reason is not acceptable, or null when it is. */
export function rejectReasonProblem(text: string): string | null {
  const length = rejectReasonLength(text);
  if (length === 0) return "A reason is required";
  if (length < REJECT_REASON_MIN) {
    return `Reason must be at least ${REJECT_REASON_MIN} characters`;
  }
  if (length > REJECT_REASON_MAX) {
    return `Reason must be at most ${REJECT_REASON_MAX} characters`;
  }
  return null;
}
