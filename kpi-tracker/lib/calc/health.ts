// CRM health score and action lists.
import type { KpiConfig } from '../../config/kpi.config';
import { localDate, shiftDays } from '../dates';
import type { ActionItem, HealthMetric, KpiResponse, RecordLink, Row } from '../types';
import { contactsByAccount, priorityAccounts } from './coverage';
import { bant } from './opportunities';
import { blank, get, num, pct, ragFor, recordUrl } from './util';

export const HEALTH_LABELS: Record<keyof KpiConfig['health']['weights'], string> = {
  priorityWithContact: 'Priority accounts with at least one contact',
  priorityWithMinContacts: 'Priority accounts with enough contacts',
  contactCompleteness: 'Contact completeness',
  bantCompleteness: 'BANT completeness',
  multiThreading: 'Opportunity multi-threading',
  oppHygiene: 'Opportunity hygiene',
  freshness: 'Freshness',
  duplicateContacts: 'Duplicate contacts',
};

export const ACTION_LIST_LABELS: Record<string, string> = {
  warmIntros: 'Warm intros not yet actioned',
  activeNoNextAction: 'Active deal contacts with no next action',
  stalledOpps: 'Stalled opportunities',
  overdueOpps: 'Overdue opportunities',
};

const FAILING_CAP = 200;

const CONTACT_FIELDS = [
  ['persona', 'Contact_Persona__c'],
  ['seniority', 'Seniority__c'],
  ['LinkedIn', 'LinkedIn_URL__c'],
  ['email', 'Email'],
  ['title', 'Title'],
] as const;

const fmtDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function calcHealth(
  input: {
    accounts: Row[];
    priorityContacts: Row[];
    opportunities: Row[];
    contactRoles: Row[];
    warmIntros: Row[];
    activeNoNextAction: Row[];
    duplicateEmails: Row[];
    duplicateContacts: Row[];
    emailTotal: number;
  },
  now: Date,
  cfg: KpiConfig,
): KpiResponse['crmHealth'] {
  const h = cfg.health;
  const url = (id: string) => recordUrl(cfg.salesforceBaseUrl, id);
  const link = (r: Row, name?: string): RecordLink => ({ id: r.Id, name: name ?? r.Name ?? r.Id, url: url(r.Id) });
  const today = localDate(now, cfg);

  const metric = (key: keyof typeof h.weights, total: number, fail: RecordLink[], failCount = fail.length): HealthMetric => {
    const passRate = pct(total - failCount, total);
    return {
      key,
      label: HEALTH_LABELS[key],
      passRate,
      threshold: h.greenAt,
      rag: ragFor(passRate, h.greenAt, h.amberAt),
      weight: h.weights[key],
      passed: total - failCount,
      total,
      failing: fail.slice(0, FAILING_CAP),
    };
  };
  const split = <T,>(items: T[], ok: (t: T) => boolean) => [items.filter(ok), items.filter((t) => !ok(t))] as const;

  const priority = priorityAccounts(input.accounts, cfg);
  const byAccount = contactsByAccount(input.priorityContacts);
  const n = (a: Row) => byAccount.get(a.Id)?.length ?? 0;

  const [, noContact] = split(priority, (a) => n(a) >= 1);
  const [, tooFew] = split(priority, (a) => n(a) >= h.minContactsPerAccount);

  const missingFields = (c: Row) => CONTACT_FIELDS.filter(([, f]) => blank(c[f])).map(([l]) => l);
  const [, incomplete] = split(input.priorityContacts, (c) => missingFields(c).length === 0);

  const open = input.opportunities.filter((o) => o.IsClosed === false);
  const [, bantMissing] = split(open, (o) => bant(o, cfg).count === 4);

  const roles = new Map(input.contactRoles.map((r) => [r.OpportunityId as string, Number(r.c ?? 0)]));
  const [, thin] = split(open, (o) => (roles.get(o.Id) ?? 0) >= h.minContactsPerOpp);

  const hygieneGaps = (o: Row) => [
    ...(blank(o.NextStep) ? ['next step'] : []),
    ...(num(o.Amount) == null ? ['amount'] : []),
    ...(!o.CloseDate || o.CloseDate < today ? ['future close date'] : []),
  ];
  const [, untidy] = split(open, (o) => hygieneGaps(o).length === 0);

  const freshFrom = localDate(shiftDays(now, -h.freshnessDays, cfg), cfg);
  const freshScope = input.accounts.filter((a) => h.freshnessStatuses.includes(a.Relationship_Status__c));
  const [, staleAccts] = split(freshScope, (a) => !!a.Last_Meaningful_Interaction_Date__c && a.Last_Meaningful_Interaction_Date__c >= freshFrom);

  const dupCount = input.duplicateEmails.reduce((s, r) => s + Number(r.c ?? 0), 0);

  const metrics: HealthMetric[] = [
    metric('priorityWithContact', priority.length, noContact.map((a) => link(a))),
    metric('priorityWithMinContacts', priority.length, tooFew.map((a) => link(a, `${a.Name} (${n(a)} contacts)`))),
    metric('contactCompleteness', input.priorityContacts.length, incomplete.map((c) => link(c, `${c.Name}, ${get(c, 'Account.Name') ?? ''}: missing ${missingFields(c).join(', ')}`))),
    metric('bantCompleteness', open.length, bantMissing.map((o) => link(o, `${o.Name}: missing ${bant(o, cfg).missing.join(', ')}`))),
    metric('multiThreading', open.length, thin.map((o) => link(o, `${o.Name} (${roles.get(o.Id) ?? 0} contact roles)`))),
    metric('oppHygiene', open.length, untidy.map((o) => link(o, `${o.Name}: no ${hygieneGaps(o).join(', no ')}`))),
    metric('freshness', freshScope.length, staleAccts.map((a) => link(a, `${a.Name} (${a.Last_Meaningful_Interaction_Date__c ? `last ${fmtDate(a.Last_Meaningful_Interaction_Date__c)}` : 'no date'})`))),
    metric('duplicateContacts', input.emailTotal, input.duplicateContacts.map((c) => link(c, `${c.Name} <${c.Email}>`)), dupCount),
  ];
  // Metrics with nothing to measure are left out of the score rather than counted as 100.
  const scored = metrics.filter((m) => m.total > 0);
  const weight = scored.reduce((s, m) => s + m.weight, 0);
  const score = weight === 0 ? 0 : Math.round(scored.reduce((s, m) => s + m.passRate * m.weight, 0) / weight);

  const staleFrom = localDate(shiftDays(now, -h.staleActivityDays, cfg), cfg);
  const action = (r: Row, detail: string): ActionItem => ({ id: r.Id, name: r.Name, detail, url: url(r.Id) });
  const actionLists: Record<string, ActionItem[]> = {
    warmIntros: input.warmIntros.map((c) =>
      action(c, [get(c, 'Account.Name'), c.Introducer_Referred_By__c ? `referred by ${c.Introducer_Referred_By__c}` : 'introducer not recorded'].filter(Boolean).join(', '))),
    activeNoNextAction: input.activeNoNextAction.map((c) => action(c, get(c, 'Account.Name') ?? '')),
    stalledOpps: open
      .filter((o) => !o.LastActivityDate || o.LastActivityDate < staleFrom)
      .sort((a, b) => String(a.LastActivityDate ?? '').localeCompare(String(b.LastActivityDate ?? '')))
      .map((o) => action(o, `${get(o, 'Account.Name') ?? ''}, ${o.LastActivityDate ? `last activity ${fmtDate(o.LastActivityDate)}` : 'no activity logged'}`)),
    overdueOpps: open
      .filter((o) => o.CloseDate && o.CloseDate < today)
      .sort((a, b) => a.CloseDate.localeCompare(b.CloseDate))
      .map((o) => action(o, `${get(o, 'Account.Name') ?? ''}, close date ${fmtDate(o.CloseDate)}, ${o.StageName}`)),
  };

  return { score, rag: ragFor(score, h.greenAt, h.amberAt), metrics, actionLists };
}

