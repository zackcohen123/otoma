import { formatDate, relativeDays } from "@/lib/activity";
import { getCompanyNews } from "@/lib/news";

export async function NewsPanel({ accountName, override }: { accountName: string; override: string | null }) {
  const news = await getCompanyNews(accountName, override);

  if (news.status === "unconfigured") {
    return (
      <p className="empty">
        News isn’t set up. Add a <code>GNEWS_API_KEY</code> environment variable (free at gnews.io).
      </p>
    );
  }
  if (news.status === "error") {
    return <p className="empty">News is unavailable right now ({news.message}). It retries on the next page load.</p>;
  }
  if (!news.articles.length) {
    return <p className="empty">No recent coverage for {news.query || accountName} in the last 60 days.</p>;
  }
  return (
    <>
      <ul className="news">
        {news.articles.map((a) => (
          <li key={a.url}>
            <a href={a.url} target="_blank" rel="noopener noreferrer">
              {a.title}
            </a>
            <div className="src num">
              {a.source ?? "Unknown source"} · <span title={formatDate(a.publishedAt)}>{relativeDays(a.publishedAt)}</span>
            </div>
            {a.description && <div className="desc">{a.description}</div>}
          </li>
        ))}
      </ul>
      <p className="hint">
        Search: {news.query} · cached, checked {relativeTime(news.fetchedAt)}
      </p>
    </>
  );
}

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

export function NewsSkeleton() {
  return (
    <ul className="news" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <div className="skeleton" style={{ height: 14, width: "85%" }} />
          <div className="skeleton" style={{ height: 10, width: "40%", marginTop: 8 }} />
        </li>
      ))}
    </ul>
  );
}
