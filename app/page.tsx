import Link from "next/link";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SearchBox } from "@/components/SearchBox";
import { SetupNeeded } from "@/components/SetupNeeded";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatDate, relativeDays } from "@/lib/activity";
import { describeSalesforceError, SalesforceConfigError } from "@/lib/errors";
import { isDemoMode, searchAccounts } from "@/lib/salesforce/accounts";
import { statusTone } from "@/lib/status";
import type { AccountSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 80);

  let accounts: AccountSummary[];
  try {
    accounts = await searchAccounts(q);
  } catch (err) {
    if (err instanceof SalesforceConfigError) return <SetupNeeded missing={err.missing} />;
    return <ErrorNotice {...describeSalesforceError(err)} />;
  }

  return (
    <>
      {isDemoMode() && <div className="banner">Demo data — not connected to Salesforce (SALESFORCE_MODE=demo)</div>}
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="wordmark">
            Otoma <span>Account Cheat Sheet</span>
          </Link>
          <ThemeToggle className="on-rail" />
        </div>
      </header>
      <main className="landing">
        <h1>Who are you calling?</h1>
        <SearchBox initial={q} />
        <div className="results-head">
          <span className="eyebrow">{q ? `${accounts.length}${accounts.length === 50 ? "+" : ""} matching “${q}”` : "Recently updated"}</span>
        </div>
        {accounts.length === 0 ? (
          <p className="empty">No accounts match “{q}”. Try fewer letters or the legal name.</p>
        ) : (
          <ul className="results">
            {accounts.map((a) => {
              const tone = statusTone(a.relationshipStatus);
              return (
                <li key={a.id}>
                  <Link href={`/a/${a.id}`} className="result" prefetch={false}>
                    <span className="name">{a.name}</span>
                    <span className="cell">
                      {a.relationshipStatus ? (
                        <span className={`badge ${tone}`}>{a.relationshipStatus}</span>
                      ) : (
                        a.type ?? "—"
                      )}
                    </span>
                    <span className="cell hide-sm">{[a.region, a.country].filter(Boolean).join(" · ") || "—"}</span>
                    <span className="cell hide-sm">{a.ownerName ?? "—"}</span>
                    <span className="cell when num hide-sm" title={a.lastActivityDate ? `Last activity ${formatDate(a.lastActivityDate)}` : "No activity logged"}>
                      {a.lastActivityDate ? relativeDays(a.lastActivityDate) : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
