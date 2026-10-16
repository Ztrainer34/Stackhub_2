/**
 * Guards for URLs that come from outside the code — a query parameter, or a
 * value a user stored — before they are navigated to.
 */

const ORIGIN_PROBE = "http://stackhub.invalid";

/**
 * Returns `next` if it is a path on this site, otherwise "/".
 *
 * For the `next` parameter of the auth routes. Anything else is an open
 * redirect: a stackhub.me sign-in link that lands the person on an attacker's
 * page. Checking for a leading "/" is not enough — "//evil.example" and
 * "/\evil.example" both start with one, and browsers treat them as another
 * host — so the value is resolved and must stay on the same origin.
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";

  try {
    const resolved = new URL(next, ORIGIN_PROBE);
    if (resolved.origin !== ORIGIN_PROBE) return "/";
    const path = resolved.pathname + resolved.search + resolved.hash;
    // Checked again AFTER resolving: dot segments can collapse into a
    // protocol-relative URL — "/..//evil.example" resolves to the path
    // "//evil.example", which a browser follows off-site.
    if (path.startsWith("//") || path.startsWith("/\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}

/**
 * Returns the URL if it is an absolute http(s) link, otherwise null.
 *
 * For links opened programmatically (`window.open`, `location.href = …`).
 * React blocks `javascript:` in an `href`, but not there: a stored
 * `javascript:` value passed to window.open runs as script on this site.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
