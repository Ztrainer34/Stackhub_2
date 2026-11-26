/** The pastel behind a tool or a person without a picture, on the public pages. */
export const PASTELS = [
  "#FFE6D1",
  "#EFE2FF",
  "#E6ECFF",
  "#FFF0B8",
  "#FBDCE4",
  "#D6EEF6",
  "#D9F2E4",
] as const;

/** Always the same pastel for the same name, on the server and in the browser. */
export function pastelFor(name: string): string {
  let hash = 0;
  for (const char of name.toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return PASTELS[hash % PASTELS.length];
}

/** "Clay" -> "Cl", "n8n" -> "N8". */
export function toolMonogram(name: string): string {
  const [first = "", second = ""] = Array.from(name.replace(/[^\p{L}\p{N}]/gu, ""));
  return first.toUpperCase() + second.toLowerCase() || "?";
}

/** "Michel Lieben" -> "ML", "coldiq" -> "C". */
export function personInitials(name: string): string {
  const letters = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => Array.from(word)[0]);
  return letters.slice(0, 2).join("").toUpperCase() || "?";
}
