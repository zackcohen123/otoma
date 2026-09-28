// Market coverage of Priority TAM accounts.
import type { KpiConfig } from '../../config/kpi.config';
import type { KpiResponse, Row } from '../types';
import { blank, countBy, recordUrl } from './util';

export const BLANK_LABEL = '(blank)';

export const priorityAccounts = (accounts: Row[], cfg: KpiConfig) =>
  accounts.filter((a) => a.TAM_Segment__c === cfg.coverage.prioritySegment);

export function contactsByAccount(contacts: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const c of contacts) {
    if (!c.AccountId) continue;
    m.set(c.AccountId, [...(m.get(c.AccountId) ?? []), c]);
  }
  return m;
}

/** Engaged means a status is set and it is not the "not engaged" status. */
export const isEngaged = (a: Row, cfg: KpiConfig) =>
  !blank(a.Relationship_Status__c) && a.Relationship_Status__c !== cfg.coverage.notEngagedStatus;

export function engagementRate(priority: Row[], cfg: KpiConfig): number {
  if (priority.length === 0) return 0;
  return Math.round((priority.filter((a) => isEngaged(a, cfg)).length / priority.length) * 1000) / 10;
}

export function calcCoverage(
  input: { accounts: Row[]; priorityContacts: Row[]; personaValues: Row[] },
  cfg: KpiConfig,
  history: { weekStart: string; engagementRate: number }[],
  currentWeekStart: string,
): KpiResponse['coverage'] {
  const priority = priorityAccounts(input.accounts, cfg);
  const byAccount = contactsByAccount(input.priorityContacts);
  const buckets: KpiResponse['coverage']['contactBuckets'] = { '0': 0, '1-2': 0, '3-4': 0, '5+': 0 };
  for (const a of priority) {
    const n = byAccount.get(a.Id)?.length ?? 0;
    buckets[n === 0 ? '0' : n <= 2 ? '1-2' : n <= 4 ? '3-4' : '5+']++;
  }

  // Persona values come from the picklist definition, falling back to values seen in the data.
  const fromPicklist = input.personaValues.filter((p) => p.IsActive !== false).map((p) => String(p.Value));
  const fromData = [...new Set(input.priorityContacts.map((c) => c.Contact_Persona__c).filter((v) => !blank(v)))] as string[];
  const personaValues = [...new Set([...fromPicklist, ...fromData])];
  const personaGaps: Record<string, number> = {};
  for (const p of personaValues) {
    personaGaps[p] = priority.filter((a) => !(byAccount.get(a.Id) ?? []).some((c) => c.Contact_Persona__c === p)).length;
  }

  const rate = engagementRate(priority, cfg);
  const trend = history.filter((h) => h.weekStart !== currentWeekStart).map((h) => ({ weekStart: h.weekStart, rate: h.engagementRate }));
  trend.push({ weekStart: currentWeekStart, rate });

  return {
    priorityTotal: priority.length,
    byStatus: countBy(priority, (a) => (blank(a.Relationship_Status__c) ? BLANK_LABEL : a.Relationship_Status__c)),
    byRegion: countBy(priority, (a) => (blank(a.Region__c) ? BLANK_LABEL : a.Region__c)),
    noContacts: priority
      .filter((a) => !byAccount.has(a.Id))
      .map((a) => ({ id: a.Id, name: a.Name, region: a.Region__c ?? '', status: a.Relationship_Status__c ?? '', url: recordUrl(cfg.salesforceBaseUrl, a.Id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    contactBuckets: buckets,
    personaGaps,
    personaValues,
    engagementRate: rate,
    engagementTrend: trend.sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-26),
  };
}
