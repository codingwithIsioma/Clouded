/** Words that carry meaning in an error message: numbers, hashes, paths and quoted names are dropped so two runs of the same error match. */
export function errorTokens(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/(["'`]).*?\1/g, " ")
      .replace(/(?:\/[\w.-]+)+/g, " ")
      .replace(/\b[0-9a-f]{7,}\b/g, " ")
      .replace(/\d+/g, " ")
      .split(/[^a-z_]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}
const STOP = new Set(["the", "and", "for", "with", "not", "this", "that", "from", "you", "are", "was", "has", "have", "your", "but", "can", "error"]);

export function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((w) => b.has(w) && inter++);
  return inter / Math.min(a.size, b.size) * (inter / Math.max(a.size, b.size)) ** 0.25;
}

export const splitTags = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

export const includesCI = (hay: string | undefined, needle: string) => !!hay && hay.toLowerCase().includes(needle.toLowerCase());

/** Loose match between a concept name and a resource (title/tags/module/notes). */
export function conceptMatches(concept: string, fields: string[], tags: string[] = []) {
  const lc = concept.toLowerCase();
  if (tags.some((t) => t.length > 2 && (lc.includes(t.toLowerCase()) || t.toLowerCase().includes(lc)))) return true;
  const words = concept.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const hay = fields.join(" ").toLowerCase();
  if (!words.length) return false;
  const hits = words.filter((w) => hay.includes(w.replace(/s$/, ""))).length;
  return hits / words.length >= 0.5;
}
