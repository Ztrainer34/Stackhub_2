/**
 * Builds an API path, URL-encoding every interpolated value.
 *
 *   apiPath`/user/${username}/posts/${slug}`
 *
 * Route parameters reach these paths straight from the browser's URL, and
 * Next.js has already decoded them: a visit to /..%2Fpost%2F<id>%2Funpublish
 * arrives as the username "../post/<id>/unpublish". Interpolated unencoded, the
 * server then called /user/../post/<id>/unpublish — normalised by fetch to
 * /post/<id>/unpublish — with the visitor's own token. Encoding keeps each
 * value inside its one path segment.
 *
 * Encoding cannot help a value that IS a dot segment: encodeURIComponent
 * leaves "." alone, and URL parsing treats "%2e%2e" as ".." anyway. So "." and
 * ".." are refused outright. No real username, slug or id is either.
 */
export function apiPath(
  strings: TemplateStringsArray,
  ...values: (string | number)[]
): string {
  return strings.reduce((path, part, i) => {
    if (i >= values.length) return path + part;
    const value = String(values[i]);
    if (DOT_SEGMENT.test(value)) {
      throw new Error(`apiPath: "${value}" cannot be used as a path segment`);
    }
    return path + part + encodeURIComponent(value);
  }, "");
}

// "." and "..". Their percent-encoded spellings ("%2e", "%2e%2e") are refused
// too, though encoding would already make them harmless ("%252e"): no real
// username, slug or id looks like that, so refusing costs nothing.
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
