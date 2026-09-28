'use client';

import { useCallback, useEffect, useState } from 'react';
import { ACTION_LIST_LABELS } from '../lib/calc/health';
import { dayLabel, delta, displayLabel, money, pctText, relTime, timeLabel } from '../lib/format';
import { buildScorecard } from '../lib/scorecard';
import type { KpiResponse } from '../lib/types';
import { EngagementTrend, MonthlyQualified, StageBars, WeeklyConversations } from './charts';
import { BarList, Card, CsvButton, Definition, download, Meter, RagBadge, Section, ShowMore, Table } from './ui';

type Notice = { kind: 'info' | 'error'; text: string } | null;

export default function Dashboard() {
  const [data, setData] = useState<KpiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/kpis', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  // Load once. No background polling: every refresh costs Zapier tasks, so data only
  // refreshes on page load (when the cache is older than the TTL) or via the Refresh button.
  useEffect(() => {
    load();
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setNotice(null);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const body = await res.json();
      if (body.data) setData(body.data);
      if (res.status === 429) setNotice({ kind: 'info', text: body.error });
      else if (body.error) setNotice({ kind: 'error', text: `Refresh failed: ${body.error}` });
    } catch (e) {
      setNotice({ kind: 'error', text: `Refresh failed: ${(e as Error).message}` });
    } finally {
      setRefreshing(false);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-2xl font-semibold">GTM KPIs</h1>
        {loadError ? (
          <div role="alert" className="mt-6 rounded-lg border border-bad/40 bg-bad/5 p-4 text-sm">
            <p className="font-medium">No data yet.</p>
            <p className="mt-1 text-ink-2">{loadError}</p>
            <button type="button" onClick={load} className="mt-3 rounded bg-ink px-3 py-1.5 text-xs font-medium text-white">Try again</button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted" aria-live="polite">Loading from Salesforce. The first load can take a minute.</p>
        )}
      </main>
    );
  }

  const age = Math.max(0, Math.round((Date.now() - Date.parse(data.generatedAt)) / 1000));
  const d = data.definitions;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-6">
      <Header data={data} age={age} refreshing={refreshing} onRefresh={refresh} />
      {notice && (
        <p role="status" className={`no-print mt-3 rounded border px-3 py-2 text-sm ${notice.kind === 'error' ? 'border-bad/40 bg-bad/5' : 'border-line bg-subtle'}`}>{notice.text}</p>
      )}
      <Warnings warnings={data.warnings} />
      <Headline data={data} />
      <Conversations data={data} />
      <Coverage data={data} />
      <Pipeline data={data} />
      <Health data={data} />
      <footer className="mt-12 border-t border-line pt-4 text-xs text-muted">
        <p className="num">
          Data {relTime(age)} ({new Date(data.generatedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}). Last refresh: {data.meta.queryCount} Salesforce queries in {(data.meta.durationMs / 1000).toFixed(1)}s. Cache lasts 30 minutes. Config version {data.meta.configVersion}.
        </p>
        <p className="mt-1">{d.weeks}</p>
      </footer>
    </main>
  );
}

function Header({ data, age, refreshing, onRefresh }: { data: KpiResponse; age: number; refreshing: boolean; onRefresh: () => void }) {
  const live = data.source === 'zapier-mcp';
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-6 w-1.5 rounded bg-accent" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">GTM KPIs</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${live ? 'bg-accent-soft text-accent' : 'bg-subtle text-ink-2 ring-1 ring-line'}`}>
          {live ? 'Live from Salesforce via Zapier' : 'Mock data'}
        </span>
        <span className="text-sm text-muted" aria-live="polite">Refreshed {relTime(age)}{data.stale ? ' (stale)' : ''}</span>
      </div>
      <div className="no-print flex items-center gap-2">
        <button type="button" onClick={onRefresh} disabled={refreshing} className="rounded border border-line px-3 py-1.5 text-sm font-medium hover:bg-subtle disabled:opacity-60">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" onClick={() => download(`gtm-scorecard-${data.headline.conversations.trend.at(-1)?.weekStart ?? 'week'}.md`, buildScorecard(data), 'text/markdown')} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90">
          Export weekly scorecard
        </button>
        <button type="button" onClick={() => window.print()} className="rounded border border-line px-3 py-1.5 text-sm font-medium hover:bg-subtle">Print</button>
      </div>
    </header>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div role="status" className="mt-4 rounded-lg border border-warn/60 bg-warn/10 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[10px] font-bold text-ink" aria-hidden>!</span>
        {warnings.length === 1 ? '1 thing to check' : `${warnings.length} things to check`}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-ink-2">
        {warnings.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </div>
  );
}

function Delta({ current, previous, period }: { current: number; previous: number; period: string }) {
  const dl = delta(current, previous);
  const arrow = dl.dir === 'up' ? '▲' : dl.dir === 'down' ? '▼' : '■';
  return (
    <p className="num mt-2 text-xs text-ink-2">
      <span aria-hidden className="mr-1 text-[9px]">{arrow}</span>
      {dl.dir === 'flat' ? `Same as last ${period}` : dl.text.replace('vs last', `vs last ${period}`)} ({previous.toLocaleString('en-GB')})
    </p>
  );
}

function Tile({ label, children, definition }: { label: string; children: React.ReactNode; definition: string }) {
  return (
    <Card className="flex flex-col">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{label}</h3>
      <div className="flex-1">{children}</div>
      <Definition text={definition} />
    </Card>
  );
}

function Headline({ data }: { data: KpiResponse }) {
  const { conversations: c, qualifiedOpps: q, pipeline: p, campaign } = data.headline;
  const d = data.definitions;
  return (
    <div className={`mt-6 grid gap-4 ${campaign ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
      <Tile label="Conversations this week" definition={d.conversations}>
        <p className="mt-2 flex items-baseline gap-2"><span className="num text-4xl font-semibold">{c.thisWeek}</span><span className="text-sm text-muted">of {c.target}</span></p>
        <Meter value={c.thisWeek} target={c.target} label="Conversations against weekly target" />
        <Delta current={c.thisWeek} previous={c.lastWeek} period="week" />
        <p className="num mt-1 text-xs text-muted">{c.meetings} meetings, {c.calls} calls. {c.bookedNext7Days} booked for the next 7 days.</p>
      </Tile>
      <Tile label="Qualified opportunities this month" definition={d.qualifiedOpps}>
        <p className="mt-2 flex items-baseline gap-2"><span className="num text-4xl font-semibold">{q.thisMonth}</span><span className="text-sm text-muted">target {q.targetMin} to {q.targetMax}</span></p>
        <Meter value={q.thisMonth} target={q.targetMin} max={q.targetMax} label="Qualified opportunities against monthly target" />
        <Delta current={q.thisMonth} previous={q.lastMonth} period="month" />
      </Tile>
      <Tile label={`Pipeline created ${p.quarterLabel}`} definition={d.pipeline}>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="num text-4xl font-semibold" title={money(p.createdThisQuarter, p.currency, false)}>{money(p.createdThisQuarter, p.currency)}</span>
          <span className="text-sm text-muted">{p.target == null ? 'Target not set' : `of ${money(p.target, p.currency)}`}</span>
        </p>
        {p.target == null ? (
          <p className="mt-3 text-xs text-ink-2">Target is {p.multiple} times bookings. Set <code className="rounded bg-subtle px-1">bookingsTarget</code> in the config once agreed with Peter.</p>
        ) : (
          <>
            <Meter value={p.createdThisQuarter} target={p.target} label="Pipeline created against target" />
            <p className="num mt-2 text-xs text-ink-2">{pctText((p.createdThisQuarter / p.target) * 100)} of target</p>
          </>
        )}
        <p className="num mt-1 text-xs text-muted">Last quarter: {money(p.createdLastQuarter, p.currency)}</p>
      </Tile>
      {campaign && (
        <Tile label={`Campaign: ${campaign.name}`} definition={d.campaign ?? ''}>
          <p className="mt-2 flex items-baseline gap-2"><span className="num text-4xl font-semibold">{campaign.members}</span><span className="text-sm text-muted">target {campaign.targetMin} to {campaign.targetMax}</span></p>
          <Meter value={campaign.members} target={campaign.targetMin} max={campaign.targetMax} label="Campaign leads against target" />
          <p className="num mt-2 text-xs text-ink-2">{campaign.becameMeeting} became a meeting ({campaign.members ? pctText((campaign.becameMeeting / campaign.members) * 100) : '0%'})</p>
        </Tile>
      )}
    </div>
  );
}

function Conversations({ data }: { data: KpiResponse }) {
  const c = data.headline.conversations;
  const cal = data.calibration.unclassifiedEvents;
  return (
    <Section id="conversations" title="Conversations" subtitle={`${c.uniqueAccounts} accounts and ${c.uniqueContacts} contacts reached this week`}>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Conversations per week" definition={data.definitions.conversations}>
          <WeeklyConversations data={c.trend} target={c.target} />
        </Card>
        <Card title="This week by day">
          <BarList color="bg-accent" data={c.byDay.map((x) => ({ label: dayLabel(x.date), value: x.count }))} />
        </Card>
      </div>
      <Card title={`This week's conversations (${c.items.length})`} className="mt-4">
        <Table head={['When', 'Type', 'Person', 'Account', 'Record']} caption="Conversations this week" empty={c.items.length === 0}>
          {c.items.map((i) => (
            <tr key={i.id}>
              <td className="num whitespace-nowrap">{dayLabel(i.start)}{i.kind === 'meeting' ? `, ${timeLabel(i.start)}` : ''}</td>
              <td>{i.kind === 'meeting' ? 'Meeting' : 'Call'}{i.matchedBy === 'subject' && <span className="ml-1 text-xs text-muted" title="Not linked in Salesforce; matched from the subject">(from subject)</span>}</td>
              <td>{i.person ?? <span className="text-muted">Not linked</span>}</td>
              <td>{i.account ?? <span className="text-muted">Unknown</span>}</td>
              <td><a href={i.url} target="_blank" rel="noreferrer">{i.subject}</a></td>
            </tr>
          ))}
        </Table>
      </Card>
      <details className="mt-4 rounded-lg border border-line p-4">
        <summary className="flex items-center gap-2 text-sm font-semibold">
          <span className="chev inline-block transition-transform" aria-hidden>›</span>
          Check the rule: {cal.length} finished meetings in the last {c.trend.length} weeks were not counted
        </summary>
        <p className="mt-2 text-xs text-ink-2">Use this to widen or tighten the rule in the config. These are not part of the KPI. All-day events are left out.</p>
        <div className="mt-3">
          <Table head={['When', 'Subject', 'Why not counted']} caption="Meetings not counted as conversations" empty={cal.length === 0}>
            {cal.map((u) => (
              <tr key={u.id}>
                <td className="num whitespace-nowrap">{dayLabel(u.start)}, {timeLabel(u.start)}</td>
                <td><a href={u.url} target="_blank" rel="noreferrer">{u.subject}</a></td>
                <td className="text-ink-2">{u.reason}</td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
    </Section>
  );
}

function Coverage({ data }: { data: KpiResponse }) {
  const cv = data.coverage;
  const d = data.definitions;
  const sortDesc = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: displayLabel(label), value }));
  return (
    <Section id="coverage" title="Market coverage" subtitle={`${cv.priorityTotal} Priority TAM accounts, ${pctText(cv.engagementRate)} engaged`}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title="By relationship status" definition={d.coverage}><BarList data={sortDesc(cv.byStatus)} /></Card>
        <Card title="By region"><BarList data={sortDesc(cv.byRegion)} /></Card>
        <Card title="Contacts per account" definition={d.contactBuckets}>
          <BarList data={(['0', '1-2', '3-4', '5+'] as const).map((k) => ({ label: k === '1-2' ? '1 to 2' : k === '3-4' ? '3 to 4' : k === '5+' ? '5 or more' : 'None', value: cv.contactBuckets[k] }))} />
        </Card>
        <Card title="Accounts missing each persona" definition={d.personaGaps}>
          <BarList color="bg-accent" data={sortDesc(cv.personaGaps)} format={(v) => `${v}`} empty="No persona values found." />
        </Card>
        <Card title="Engagement rate" definition={d.engagementRate} className="lg:col-span-2">
          <p className="num mb-2 text-2xl font-semibold">{pctText(cv.engagementRate)}</p>
          <EngagementTrend data={cv.engagementTrend} />
        </Card>
      </div>
      <Card title={`Priority accounts with no contacts (${cv.noContacts.length})`} className="mt-4">
        <div className="mb-2 flex justify-end">
          <CsvButton rows={cv.noContacts} columns={['name', 'region', 'status']} filename="priority-accounts-no-contacts.csv" />
        </div>
        <Table head={['Account', 'Region', 'Status']} caption="Priority accounts with no contacts" empty={cv.noContacts.length === 0}>
          {cv.noContacts.map((a) => (
            <tr key={a.id}>
              <td><a href={a.url} target="_blank" rel="noreferrer">{a.name}</a></td>
              <td>{a.region || <span className="text-muted">Blank</span>}</td>
              <td>{a.status ? displayLabel(a.status) : <span className="text-muted">Blank</span>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </Section>
  );
}

function Pipeline({ data }: { data: KpiResponse }) {
  const pd = data.pipelineDetail;
  const q = data.headline.qualifiedOpps;
  const cur = data.headline.pipeline.currency;
  const fmt = (v: number) => money(v, cur);
  return (
    <Section id="pipeline" title="Pipeline" subtitle={`${pd.openCount} open opportunities worth ${fmt(pd.openTotal)}${pd.weighted != null ? `, weighted ${fmt(pd.weighted)}` : ''}`}>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Open pipeline by stage" definition={data.definitions.openPipeline}>
          <StageBars data={pd.byStage} fmt={fmt} />
        </Card>
        <Card title="BANT elements confirmed, open opportunities">
          <BarList color="bg-accent" data={(['4', '3', '2', '1', '0'] as const).map((k) => ({ label: `${k} of 4`, value: pd.bantDistribution[k] }))} />
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card title="Qualified opportunities by month" definition={data.definitions.qualifiedOpps}>
          <MonthlyQualified data={q.trend} min={q.targetMin} max={q.targetMax} />
        </Card>
        <Card title={`Created this month (${q.items.length})`}>
          <Table head={['Opportunity', 'Stage', 'BANT', 'Missing']} caption="Opportunities created this month" empty={q.items.length === 0}>
            {q.items.map((o) => (
              <tr key={o.id}>
                <td><a href={o.url} target="_blank" rel="noreferrer">{o.name}</a>{o.account && <div className="text-xs text-muted">{o.account}</div>}</td>
                <td className="text-ink-2">{o.stage}</td>
                <td className="num whitespace-nowrap">{o.bantConfirmed}/4{o.qualified && <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-good text-[10px] font-bold text-white" aria-hidden>✓</span>Qualified</span>}</td>
                <td className="text-ink-2">{o.missing.length ? o.missing.join(', ') : 'None'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </Section>
  );
}

function Health({ data }: { data: KpiResponse }) {
  const h = data.crmHealth;
  const d = data.definitions;
  return (
    <Section id="health" title="CRM health" subtitle="What to fix in Salesforce, and the lists to work from" action={<div className="flex items-center gap-3"><span className="num text-3xl font-semibold">{h.score}</span><span className="text-sm text-muted">/ 100</span><RagBadge rag={h.rag} size="lg" /></div>}>
      <Card definition={d.healthScore}>
        <Table head={['Metric', 'Pass rate', 'Threshold', 'Status', 'Weight', 'To fix']} caption="CRM health metrics">
          {h.metrics.map((m) => (
            <tr key={m.key}>
              <td>
                <details>
                  <summary className="font-medium"><span className="chev mr-1 inline-block transition-transform" aria-hidden>›</span>{m.label}</summary>
                  <p className="mt-1 max-w-prose text-xs text-ink-2">{d[m.key]}</p>
                  {m.failing.length > 0 && (
                    <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">
                      {m.failing.map((f) => <li key={f.id + f.name}><a href={f.url} target="_blank" rel="noreferrer">{f.name}</a></li>)}
                      {m.total - m.passed > m.failing.length && <li className="text-muted">and {m.total - m.passed - m.failing.length} more</li>}
                    </ul>
                  )}
                </details>
              </td>
              <td className="num">{m.total === 0 ? <span className="text-muted">No records</span> : pctText(m.passRate)}</td>
              <td className="num text-ink-2">{pctText(m.threshold)}</td>
              <td>{m.total === 0 ? <span className="text-xs text-muted">Not scored</span> : <RagBadge rag={m.rag as any} />}</td>
              <td className="num text-ink-2">{m.weight}</td>
              <td className="num">{(m.total - m.passed).toLocaleString('en-GB')}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {Object.entries(ACTION_LIST_LABELS).map(([key, label]) => {
          const items = h.actionLists[key] ?? [];
          return (
            <Card key={key} title={`${label} (${items.length})`} definition={d[key]}>
              {items.length === 0 ? (
                <p className="text-sm text-muted">Nothing here.</p>
              ) : (
                <ShowMore items={items} render={(i) => (
                  <li key={i.id} className="py-1.5 text-sm">
                    <a href={i.url} target="_blank" rel="noreferrer" className="font-medium">{i.name}</a>
                    {i.detail && <span className="text-ink-2">, {i.detail}</span>}
                  </li>
                )} />
              )}
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
