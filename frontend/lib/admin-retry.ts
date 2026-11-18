/**
 * React Query `retry` for the /admin queries. A 401 or 403 will not change by
 * asking again (the user is signed out, or is not an admin), so those fail at
 * once instead of being retried three times; anything else gets up to three
 * retries.
 *
 * The match is on the error message, which lib/admin.ts builds with the HTTP
 * status in it. The word boundary stops "x4030" counting as a 403.
 */
export function retryAdminQuery(failureCount: number, error: Error): boolean {
  const message = error.message;
  if (/\b(401|403)\b/.test(message) || message.includes("Authentication required")) {
    return false;
  }
  return failureCount < 3;
}
