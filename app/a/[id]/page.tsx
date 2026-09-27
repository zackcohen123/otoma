import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { ContactGrid } from "@/components/ContactGrid";
import { ErrorNotice } from "@/components/ErrorNotice";
import { NewsPanel, NewsSkeleton } from "@/components/NewsPanel";
import { Prose } from "@/components/Prose";
import { RailDrawer } from "@/components/RailDrawer";
import { SetupNeeded } from "@/components/SetupNeeded";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Timeline } from "@/components/Timeline";
import { formatDate, relativeDays } from "@/lib/activity";
import { describeSalesforceError, SalesforceConfigError } from "@/lib/errors";
import { resolveResources } from "@/lib/resources";
import { getCheatSheet } from "@/lib/salesforce/accounts";
import { statusTone } from "@/lib/status";
import type { CheatSheet } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// Dedupe the Salesforce round-trip between generateMetadata and the page within one request.
const loadSheet = cache(getCheatSheet);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sheet = await loadSheet((await params).id).catch(() => null);
  return { title: sheet?.account.name ?? "Account" };
}

export default async function CheatSheetPage({ params }: Props) {
  const { id } = await params;

  let sheet: CheatSheet | null;
  try {
    sheet = await loadSheet(id);
  } catch (err) {
    if (err instanceof SalesforceConfigError) return <SetupNeeded missing={err.missing} />;
    return <ErrorNotice {...describeSalesforceError(err)} />;
  }
  if (!sheet) notFound();

  const { account: a, contacts, activities } = sheet;
  const resources = resolveResources(a.type, a.resourcesRaw);
  const tone = statusTone(a.relationshipStatus);
  const primaryCount = contacts.filter((c) => c.isPrimary).length;

  const facts: [string, string | null][] = [
    ["Type", a.type],
    ["TAM segment", a.tamSegment],
    ["Region", a.region],
    ["Country", a.country],
    ["Payments vendor", a.paymentsVendor],
    ["Industry", a.industry],
    ["Owner", a.ownerName],
    ["Last activity", a.lastActivityDate ? `${formatDate(a.lastActivityDate)} (${relativeDays(a.lastActivityDate)})` : null],
  ];

  return (
    <>
      {sheet.demo && <div className="banner">Demo data — not connected to Salesforce (SALESFORCE_MODE=demo)</div>}
      <div className="sheet">
        <aside className="rail">
          <div className="rail-top">
            <Link href="/">← All accounts</Link>
            <ThemeToggle className="on-rail" />
          </div>

          <section className="identity">
            <span className="eyebrow">Account</span>
            <h1>{a.name}</h1>
            <div className="badges">
              {a.relationshipStatus && <span className={`badge ${tone}`}>{a.relationshipStatus}</span>}
              {a.type && <span className="badge">{a.type}</span>}
            </div>
          </section>

          <RailDrawer summary={`Quick facts · ${resources.length} resources`}>
            <section className="rail-section">
              <span className="eyebrow">Quick facts</span>
              <dl className="facts">
                {facts.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd className={v ? "" : "none"}>{v ?? "—"}</dd>
                  </div>
                ))}
                {a.website && (
                  <>
                    <dt>Website</dt>
                    <dd>
                      <a href={a.website.startsWith("http") ? a.website : `https://${a.website}`} target="_blank" rel="noopener noreferrer">
                        {a.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            </section>

            <section className="rail-section">
              <span className="eyebrow">Quick access</span>
              {resources.length === 0 ? (
                <p className="resource pending">No resources configured.</p>
              ) : (
                <ul className="resources">
                  {resources.map((r) => (
                    <li key={r.label}>
                      {r.url ? (
                        <a className="resource" href={r.url} target="_blank" rel="noopener noreferrer">
                          <span>{r.label}</span>
                          <span className="arrow" aria-hidden>↗</span>
                        </a>
                      ) : (
                        <span className="resource pending" title="No link yet. Add one in the account’s Quick Access Resources field.">
                          <span>{r.label}</span>
                          <span className="tag">Pending</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </RailDrawer>

          <footer className="rail-foot">
            {sheet.salesforceUrl && (
              <>
                <a href={sheet.salesforceUrl} target="_blank" rel="noopener noreferrer">
                  Open in Salesforce ↗
                </a>
                <br />
              </>
            )}
            Account ID <span className="num">{a.id}</span>
          </footer>
        </aside>

        <main className="main">
          <div className="main-top">
            <span>
              <span className="live-dot" aria-hidden />
              {sheet.demo ? "Demo data" : "Live from Salesforce"} · loaded{" "}
              {new Date(sheet.fetchedAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: process.env.APP_TIMEZONE?.trim() || "UTC",
                timeZoneName: "short",
              })}
            </span>
            {sheet.salesforceUrl && (
              <a href={sheet.salesforceUrl} target="_blank" rel="noopener noreferrer">
                Open in Salesforce ↗
              </a>
            )}
          </div>

          <section className="panel">
            <div className="panel-head">
              <h2>Relationship snapshot</h2>
            </div>
            <div className="snapshot">
              <div>
                <h3>Summary</h3>
                <Prose text={a.relationshipSummary} empty="No relationship summary in Salesforce yet." />
              </div>
              <div>
                <h3>Strategic notes</h3>
                <Prose text={a.strategicNotes} empty="No strategic notes in Salesforce yet." />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Contacts</h2>
              <span className="meta num">
                {contacts.length} total{primaryCount ? ` · ${primaryCount} primary` : ""}
              </span>
            </div>
            <ContactGrid
              accountId={a.id}
              contacts={contacts}
              canPin={sheet.canPinContacts}
              primaryField={process.env.SF_PRIMARY_CONTACT_FIELD?.trim() || "Primary_Contact__c"}
            />
          </section>

          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <h2>Engagement</h2>
                <span className="meta num">{activities.length} {activities.length === 1 ? "task" : "tasks"}</span>
              </div>
              <Timeline activities={activities} />
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>In the news</h2>
                <span className="meta">last 60 days</span>
              </div>
              <Suspense fallback={<NewsSkeleton />}>
                <NewsPanel accountName={a.name} override={a.newsSearchTerm} />
              </Suspense>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}
