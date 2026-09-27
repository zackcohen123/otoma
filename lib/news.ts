import "server-only";
import { unstable_cache } from "next/cache";

export type NewsArticle = {
  title: string;
  description: string | null;
  url: string;
  source: string | null;
  publishedAt: string;
};

export type NewsResult =
  | { status: "ok"; query: string; articles: NewsArticle[]; fetchedAt: string }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

const MAX_AGE_DAYS = 60;

// Legal suffixes add noise to headline matching ("Acme Holdings, Inc." → "Acme").
const SUFFIXES =
  /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|plc|corp|corporation|co|company|gmbh|ag|sa|s\.a|nv|bv|b\.v|pty|srl|spa|oy|ab|as|holdings?|group)\.?$/i;

export function newsQueryFor(accountName: string) {
  let name = accountName.replace(/\(.*?\)/g, "").replace(/[,]/g, " ").trim();
  for (let i = 0; i < 3; i++) name = name.replace(SUFFIXES, "").trim();
  // GNews treats most punctuation as syntax; keep letters, digits, spaces, & and '.
  name = name.replace(/[^\p{L}\p{N}&' ]+/gu, " ").replace(/\s+/g, " ").trim();
  return name ? `"${name}"` : "";
}

type GNewsResponse = {
  totalArticles?: number;
  articles?: { title: string; description?: string; url: string; publishedAt: string; source?: { name?: string } }[];
  errors?: string[] | Record<string, string>;
};

// Thrown errors are not cached by unstable_cache, so a failed call (quota,
// outage) is retried on the next view instead of sticking for hours.
const fetchNews = unstable_cache(
  async (q: string): Promise<{ articles: NewsArticle[]; fetchedAt: string }> => {
    const params = new URLSearchParams({
      q,
      lang: "en",
      max: "10",
      sortby: "publishedAt",
      apikey: process.env.GNEWS_API_KEY!.trim(),
    });
    const res = await fetch(`https://gnews.io/api/v4/search?${params}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as GNewsResponse;
    if (!res.ok) {
      const detail = Array.isArray(json.errors) ? json.errors.join("; ") : Object.values(json.errors ?? {}).join("; ");
      throw new Error(`GNews ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return {
      articles: (json.articles ?? []).map((a) => ({
        title: a.title,
        description: a.description?.trim() || null,
        url: a.url,
        source: a.source?.name ?? null,
        publishedAt: a.publishedAt,
      })),
      fetchedAt: new Date().toISOString(),
    };
  },
  ["gnews-search-v1"],
  { revalidate: Math.round((Number(process.env.NEWS_CACHE_HOURS) || 6) * 3600), tags: ["news"] },
);

export async function getCompanyNews(accountName: string, override: string | null): Promise<NewsResult> {
  if (!process.env.GNEWS_API_KEY?.trim()) return { status: "unconfigured" };
  const query = override?.trim() || newsQueryFor(accountName);
  if (!query) return { status: "ok", query: "", articles: [], fetchedAt: new Date().toISOString() };
  try {
    const { articles, fetchedAt } = await fetchNews(query);
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    return {
      status: "ok",
      query,
      fetchedAt,
      articles: articles.filter((a) => Date.parse(a.publishedAt) >= cutoff && /^https?:\/\//.test(a.url)),
    };
  } catch (err) {
    console.error("[news]", err);
    return { status: "error", message: err instanceof Error ? err.message : "News lookup failed" };
  }
}
