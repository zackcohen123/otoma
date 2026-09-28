// Headline KPIs 2 and 3: qualified opportunities per month, pipeline created this quarter.
import type { KpiConfig } from '../../config/kpi.config';
import { localMonth, monthStart, parseSf, quarterLabel, quarterStart, shiftMonths, shiftQuarters } from '../dates';
import type { KpiResponse, QualifiedOppItem, Row } from '../types';
import { blank, get, num, recordUrl } from './util';

export const BANT_FIELDS = [
  ['Budget', 'Budget_Confirmed__c'],
  ['Authority', 'Authority_Confirmed__c'],
  ['Need', 'Need_Confirmed__c'],
  ['Timeline', 'Timeline_Confirmed__c'],
] as const;

/** A BANT element is confirmed if the checkbox is true or the picklist value is a positive one. */
export function isConfirmed(v: unknown, cfg: KpiConfig): boolean {
  if (v === true) return true;
  if (typeof v === 'string') return cfg.qualification.positivePicklistValues.includes(v.trim().toLowerCase());
  return false;
}

export function bant(opp: Row, cfg: KpiConfig): { count: number; missing: string[] } {
  const missing = BANT_FIELDS.filter(([, f]) => !isConfirmed(opp[f], cfg)).map(([label]) => label);
  return { count: BANT_FIELDS.length - missing.length, missing };
}

export const isQualified = (opp: Row, cfg: KpiConfig) => bant(opp, cfg).count >= cfg.qualification.qualifiedMinBant;
const isClosedLost = (o: Row) => o.IsClosed === true && o.IsWon !== true;
const created = (o: Row) => parseSf(o.CreatedDate);
const between = (d: Date | null, from: Date, to: Date) => !!d && d >= from && d < to;

export function calcQualifiedOpps(opps: Row[], now: Date, cfg: KpiConfig): KpiResponse['headline']['qualifiedOpps'] {
  const thisMonth = monthStart(now, cfg);
  const nextMonth = shiftMonths(thisMonth, 1, cfg);
  const lastMonth = shiftMonths(thisMonth, -1, cfg);
  const qualifiedIn = (from: Date, to: Date) => opps.filter((o) => between(created(o), from, to) && isQualified(o, cfg)).length;

  const trend = [];
  for (let i = cfg.qualification.trendMonths - 1; i >= 0; i--) {
    const from = shiftMonths(thisMonth, -i, cfg);
    trend.push({ month: localMonth(from, cfg), count: qualifiedIn(from, shiftMonths(from, 1, cfg)) });
  }

  const items: QualifiedOppItem[] = opps
    .filter((o) => between(created(o), thisMonth, nextMonth))
    .map((o) => {
      const b = bant(o, cfg);
      return {
        id: o.Id,
        name: o.Name,
        account: get(o, 'Account.Name') ?? null,
        stage: o.StageName,
        amount: num(o.Amount),
        created: created(o)!.toISOString(),
        bantConfirmed: b.count,
        missing: b.missing,
        qualified: b.count >= cfg.qualification.qualifiedMinBant,
        url: recordUrl(cfg.salesforceBaseUrl, o.Id),
      };
    })
    .sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.bantConfirmed - a.bantConfirmed);

  return {
    thisMonth: qualifiedIn(thisMonth, nextMonth),
    lastMonth: qualifiedIn(lastMonth, thisMonth),
    targetMin: cfg.targets.qualifiedOppsPerMonth.min,
    targetMax: cfg.targets.qualifiedOppsPerMonth.max,
    trend,
    items,
  };
}

export function calcPipeline(opps: Row[], now: Date, cfg: KpiConfig): KpiResponse['headline']['pipeline'] {
  const q = quarterStart(now, cfg);
  const sumCreated = (from: Date, to: Date) =>
    opps.filter((o) => between(created(o), from, to) && !isClosedLost(o)).reduce((s, o) => s + (num(o.Amount) ?? 0), 0);
  const { bookingsTarget, pipelineMultiple } = cfg.targets;
  return {
    createdThisQuarter: sumCreated(q, shiftQuarters(q, 1, cfg)),
    createdLastQuarter: sumCreated(shiftQuarters(q, -1, cfg), q),
    target: bookingsTarget == null ? null : bookingsTarget * pipelineMultiple,
    multiple: pipelineMultiple,
    currency: cfg.currency,
    quarterLabel: quarterLabel(now, cfg),
  };
}

export function calcPipelineDetail(opps: Row[], cfg: KpiConfig): KpiResponse['pipelineDetail'] {
  const open = opps.filter((o) => o.IsClosed === false);
  const stages = new Map<string, { stage: string; count: number; value: number }>();
  for (const o of open) {
    const stage = blank(o.StageName) ? '(no stage)' : o.StageName;
    const s = stages.get(stage) ?? { stage, count: 0, value: 0 };
    s.count++;
    s.value += num(o.Amount) ?? 0;
    stages.set(stage, s);
  }
  const hasProbability = open.some((o) => num(o.Probability) != null);
  const dist: KpiResponse['pipelineDetail']['bantDistribution'] = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 };
  for (const o of open) dist[String(bant(o, cfg).count) as keyof typeof dist]++;
  return {
    byStage: [...stages.values()].sort((a, b) => a.stage.localeCompare(b.stage, 'en-GB', { numeric: true })),
    openTotal: open.reduce((s, o) => s + (num(o.Amount) ?? 0), 0),
    openCount: open.length,
    weighted: hasProbability ? open.reduce((s, o) => s + ((num(o.Amount) ?? 0) * (num(o.Probability) ?? 0)) / 100, 0) : null,
    bantDistribution: dist,
  };
}
