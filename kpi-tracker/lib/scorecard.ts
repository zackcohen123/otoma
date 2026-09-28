// One-page Markdown scorecard for the Monday debrief.
import { ACTION_LIST_LABELS } from './calc/health';
import { dateLong, dayLabel, money, pctText } from './format';
import type { KpiResponse } from './types';

const LIST_CAP = 8;

export function topGaps(r: KpiResponse, n = 3) {
  return r.crmHealth.metrics
    .filter((m) => m.total > 0 && m.passRate < m.threshold)
    .sort((a, b) => (b.threshold - b.passRate) * b.weight - (a.threshold - a.passRate) * a.weight)
    .slice(0, n);
}

export function buildScorecard(r: KpiResponse): string {
  const h = r.headline;
  const c = h.conversations;
  const p = h.pipeline;
  const q = h.qualifiedOpps;
  const weekStart = c.trend.at(-1)?.weekStart ?? r.generatedAt.slice(0, 10);
  const lines: string[] = [];
  const push = (...xs: string[]) => lines.push(...xs);

  push(`# GTM weekly scorecard`, '', `Week starting ${dateLong(weekStart)}. Data from ${r.source === 'mock' ? 'mock data' : 'Salesforce'}, refreshed ${new Date(r.generatedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })}.`, '');

  push('## Headline', '', '| KPI | Now | Target | Previous |', '|---|---:|---:|---:|');
  push(`| Genuine conversations this week | ${c.thisWeek} | ${c.target} | ${c.lastWeek} |`);
  push(`| Qualified opportunities this month | ${q.thisMonth} | ${q.targetMin} to ${q.targetMax} | ${q.lastMonth} |`);
  push(`| Pipeline created ${p.quarterLabel} | ${money(p.createdThisQuarter, p.currency)} | ${p.target == null ? 'Target not set' : money(p.target, p.currency)} | ${money(p.createdLastQuarter, p.currency)} |`);
  push('', `Meetings ${c.meetings}, calls ${c.calls}, ${c.uniqueAccounts} accounts and ${c.uniqueContacts} contacts reached. ${c.bookedNext7Days} booked for the next 7 days. CRM health ${r.crmHealth.score}/100 (${r.crmHealth.rag}).`, '');

  push('## Conversations by day', '', `| ${c.byDay.map((d) => dayLabel(d.date)).join(' | ')} |`, `|${c.byDay.map(() => '---:').join('|')}|`, `| ${c.byDay.map((d) => d.count).join(' | ')} |`, '');

  const gaps = topGaps(r);
  push('## Top three gaps', '');
  if (gaps.length === 0) push('No health metric is below its threshold.');
  gaps.forEach((g, i) => push(`${i + 1}. **${g.label}**: ${pctText(g.passRate)} against ${pctText(g.threshold)} (${g.total - g.passed} records to fix)`));
  push('');

  push('## Action lists', '');
  for (const [key, label] of Object.entries(ACTION_LIST_LABELS)) {
    const items = r.crmHealth.actionLists[key] ?? [];
    push(`### ${label} (${items.length})`, '');
    if (items.length === 0) push('None.');
    for (const it of items.slice(0, LIST_CAP)) push(`- [${it.name}](${it.url})${it.detail ? `: ${it.detail}` : ''}`);
    if (items.length > LIST_CAP) push(`- and ${items.length - LIST_CAP} more`);
    push('');
  }

  if (r.warnings.length) {
    push('## Data warnings', '');
    for (const w of r.warnings) push(`- ${w}`);
    push('');
  }
  return lines.join('\n');
}
