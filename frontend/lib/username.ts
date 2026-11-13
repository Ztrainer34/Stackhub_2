/**
 * The username rule, mirrored from the backend (usernameProblem in
 * backend/cmd/server/limits.go) and the profiles_username_format constraint.
 * Usernames appear in URLs and in links inside notification emails, so only
 * these characters are allowed. Keep the messages in step with the backend:
 * the forms show these before the server would.
 */
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/;

/** Usernames are case-insensitive: the server lowercases and trims them. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Why a username is not allowed, or null if it is. Normalises first. */
export function usernameProblem(raw: string): string | null {
  const username = normalizeUsername(raw);
  const length = Array.from(username).length;
  if (length < 3) return "Username must be at least 3 characters long";
  if (length > 30) return "Username must be at most 30 characters long";
  if (!USERNAME_PATTERN.test(username)) {
    return "Username can only contain lowercase letters, numbers, hyphens and underscores";
  }
  return null;
}
