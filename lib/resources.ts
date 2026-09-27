import { resourceDefaults } from "@/config/resources";

export type Resource = { label: string; url: string | null; source: "account" | "default" };

function safeUrl(raw: string | undefined) {
  const v = raw?.trim();
  if (!v || /^pending$/i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Account field format, one resource per line:
 *   Label | https://link
 *   Label |            (pending: no link yet)
 * A bare URL on its own line is also accepted and labelled by hostname.
 */
export function parseResourceField(raw: string | null): Resource[] {
  if (!raw) return [];
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): Resource => {
      const bar = line.indexOf("|");
      if (bar === -1) {
        const url = safeUrl(line);
        return { label: url ? new URL(url).hostname : line, url, source: "account" };
      }
      return { label: line.slice(0, bar).trim() || "Untitled", url: safeUrl(line.slice(bar + 1)), source: "account" };
    });
}

export function resolveResources(accountType: string | null, raw: string | null): Resource[] {
  const typeKey = Object.keys(resourceDefaults).find(
    (k) => k !== "*" && accountType && k.toLowerCase() === accountType.toLowerCase(),
  );
  const defaults: Resource[] = [...(resourceDefaults["*"] ?? []), ...(typeKey ? resourceDefaults[typeKey] : [])].map(
    (d) => ({ label: d.label, url: safeUrl(d.url), source: "default" }),
  );
  const own = parseResourceField(raw);
  const ownByLabel = new Map(own.map((r) => [r.label.toLowerCase(), r]));
  const merged = defaults.map((d) => ownByLabel.get(d.label.toLowerCase()) ?? d);
  const seen = new Set(merged.map((r) => r.label.toLowerCase()));
  return [...merged, ...own.filter((r) => !seen.has(r.label.toLowerCase()))];
}
