// Headline KPI 1: genuine conversations per week.
import type { KpiConfig } from '../../config/kpi.config';
import { dateToInstant, localDate, parseSf, shiftDays, shiftWeeks, weekStart } from '../dates';
import type { ConversationItem, KpiResponse, Row } from '../types';
import { blank, containsAny, get, isContactId, recordUrl } from './util';

type AccountRef = { id: string; name: string };

const SUFFIX = /\s*(\(.*\)|,?\s+(plc|ltd\.?|limited|inc\.?|ag|sa|s\.a\.|n\.a\.|a\/s|group|holdings?|corp\.?|corporation))+\s*$/i;

/** Builds a subject matcher: returns the account whose name (or alias) appears in a subject. */
export function accountMatcher(accounts: Row[], cfg: KpiConfig): (subject: string) => AccountRef | null {
  const c = cfg.conversations;
  const internal = new Set(c.internalAccountNames.map((n) => n.toLowerCase()));
  const ignored = new Set(c.ignoreAccountNames.map((n) => n.toLowerCase()));
  const byName = new Map<string, AccountRef>();
  const candidates: { term: string; ref: AccountRef; priority: boolean }[] = [];
  for (const a of accounts) {
    const name = String(a.Name ?? '').trim();
    if (!name || internal.has(name.toLowerCase()) || ignored.has(name.toLowerCase())) continue;
    const ref = { id: a.Id, name };
    byName.set(name.toLowerCase(), ref);
    const priority = a.TAM_Segment__c === cfg.coverage.prioritySegment;
    for (const term of new Set([name, name.replace(SUFFIX, '').trim()])) {
      if (term.length >= 3) candidates.push({ term, ref, priority });
    }
  }
  for (const [alias, target] of Object.entries(c.accountAliases)) {
    const ref = byName.get(target.toLowerCase());
    if (ref && alias.length >= 2) candidates.push({ term: alias, ref, priority: true });
  }
  // Longest term first, so "Barclays Bank plc" beats "Barclays"; priority accounts win ties.
  candidates.sort((a, b) => b.term.length - a.term.length || Number(b.priority) - Number(a.priority));
  const compiled = candidates.map((cand) => ({
    ...cand,
    re: new RegExp(`(?<![\\p{L}\\p{N}])${cand.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu'),
  }));
  return (subject) => compiled.find((cand) => cand.re.test(subject))?.ref ?? null;
}

export type EventVerdict =
  | { kind: 'qualified'; item: ConversationItem; future: boolean }
  | { kind: 'rejected'; reason: string; finished: boolean; allDay: boolean };

export function classifyEvent(e: Row, now: Date, cfg: KpiConfig, match: (s: string) => AccountRef | null): EventVerdict {
  const c = cfg.conversations;
  const start = parseSf(e.StartDateTime);
  const end = parseSf(e.EndDateTime) ?? start;
  const finished = !!end && end.getTime() <= now.getTime();
  const subject = String(e.Subject ?? '');
  const reject = (reason: string) => ({ kind: 'rejected' as const, reason, finished, allDay: !!e.IsAllDayEvent });

  if (!start) return reject('no start time');
  if (e.IsAllDayEvent) return reject('all-day event');
  if (e.IsChild) return reject('invitee copy');
  if (containsAny(subject, c.excludeSubjectSignals)) return reject('cancelled or declined');
  if ((e.DurationInMinutes ?? 0) < c.minMeetingMinutes) return reject(`shorter than ${c.minMeetingMinutes} minutes`);

  const looksLikeMeeting =
    containsAny(e.Location, c.locationSignals) ||
    containsAny(subject, c.subjectSignals) ||
    (e.Type != null && c.meetingTypes.map((t) => t.toLowerCase()).includes(String(e.Type).toLowerCase()));
  if (!looksLikeMeeting) return reject('no Teams, video or call signal');

  const accountName = get(e, 'Account.Name') as string | undefined;
  if (accountName && c.internalAccountNames.some((n) => n.toLowerCase() === accountName.toLowerCase())) {
    return reject('internal account');
  }

  const contactId = isContactId(e.WhoId) ? (e.WhoId as string) : null;
  let account: AccountRef | null = e.AccountId && accountName ? { id: e.AccountId, name: accountName } : null;
  let matchedBy: ConversationItem['matchedBy'] = 'linked';

  if (!contactId && !account) {
    if (!c.matchUnlinkedBySubject) return reject('no external contact or account');
    account = match(subject);
    matchedBy = 'subject';
    if (!account && !containsAny(subject, c.externalSubjectSignals)) return reject('no external contact or account');
  }

  const item: ConversationItem = {
    id: e.Id,
    kind: 'meeting',
    start: start.toISOString(),
    subject,
    person: contactId ? (get(e, 'Who.Name') ?? null) : null,
    account: account?.name ?? null,
    accountId: account?.id ?? null,
    contactId,
    matchedBy,
    url: recordUrl(cfg.salesforceBaseUrl, e.Id),
  };
  return { kind: 'qualified', item, future: !finished };
}

export function classifyCall(t: Row, cfg: KpiConfig): ConversationItem | null {
  const c = cfg.conversations;
  if (t.TaskSubtype !== 'Call' || t.Status !== 'Completed' || !t.ActivityDate) return null;
  if (t.CallDurationInSeconds != null && t.CallDurationInSeconds < c.minCallSeconds) return null;
  const contactId = isContactId(t.WhoId) ? (t.WhoId as string) : null;
  const accountName = get(t, 'Account.Name') as string | undefined;
  if (accountName && c.internalAccountNames.some((n) => n.toLowerCase() === accountName.toLowerCase())) return null;
  if (!contactId && !t.AccountId) return null;
  return {
    id: t.Id,
    kind: 'call',
    start: dateToInstant(t.ActivityDate, cfg).toISOString(),
    subject: String(t.Subject ?? 'Call'),
    person: contactId ? (get(t, 'Who.Name') ?? null) : null,
    account: accountName ?? null,
    accountId: t.AccountId ?? null,
    contactId,
    matchedBy: 'linked',
    url: recordUrl(cfg.salesforceBaseUrl, t.Id),
  };
}

type Conversations = KpiResponse['headline']['conversations'];

export function calcConversations(
  input: { events: Row[]; calls: Row[]; accounts: Row[] },
  now: Date,
  cfg: KpiConfig,
): { conversations: Conversations; calibration: KpiResponse['calibration']; warnings: string[]; all: ConversationItem[] } {
  const c = cfg.conversations;
  const match = accountMatcher(input.accounts, cfg);
  const thisWeek = weekStart(now, cfg);
  const trendFrom = shiftWeeks(thisWeek, -(c.trendWeeks - 1), cfg);
  const next7 = shiftDays(now, 7, cfg);

  const done: ConversationItem[] = [];
  let booked = 0;
  const unclassified: KpiResponse['calibration']['unclassifiedEvents'] = [];
  const seen = new Set<string>();

  for (const e of input.events) {
    if (seen.has(e.Id)) continue; // count each item once
    seen.add(e.Id);
    const v = classifyEvent(e, now, cfg, match);
    if (v.kind === 'qualified') {
      const start = new Date(v.item.start);
      if (!v.future) done.push(v.item);
      else if (start < next7) booked++;
    } else if (v.finished && !v.allDay) {
      unclassified.push({
        id: e.Id,
        subject: String(e.Subject ?? '(no subject)'),
        type: e.Type ?? null,
        start: parseSf(e.StartDateTime)?.toISOString() ?? '',
        reason: v.reason,
        url: recordUrl(cfg.salesforceBaseUrl, e.Id),
      });
    }
  }
  const callItems = c.includeCalls ? input.calls.map((t) => classifyCall(t, cfg)).filter((x): x is ConversationItem => !!x) : [];
  const all = [...done, ...callItems.filter((x) => !seen.has(x.id))].filter((x) => new Date(x.start) >= trendFrom && new Date(x.start) <= now);

  const inWeek = (ws: Date) => {
    const we = shiftWeeks(ws, 1, cfg);
    return all.filter((x) => new Date(x.start) >= ws && new Date(x.start) < we);
  };

  const trend: Conversations['trend'] = [];
  for (let i = c.trendWeeks - 1; i >= 0; i--) {
    const ws = shiftWeeks(thisWeek, -i, cfg);
    const wsDate = localDate(ws, cfg);
    const weDate = localDate(shiftDays(ws, 6, cfg), cfg);
    const ev = cfg.events.find((x) => x.start <= weDate && x.end >= wsDate);
    trend.push({ weekStart: wsDate, count: inWeek(ws).length, ...(ev ? { sibos: /sibos/i.test(ev.name), event: ev.name } : {}) });
  }

  const week = inWeek(thisWeek).sort((a, b) => a.start.localeCompare(b.start));
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const date = localDate(shiftDays(thisWeek, i, cfg), cfg);
    return { date, count: week.filter((x) => localDate(new Date(x.start), cfg) === date).length };
  });

  const warnings: string[] = [];
  if (c.includeCalls && input.calls.length === 0) {
    warnings.push(`No completed calls are logged in Salesforce in the last ${c.trendWeeks} weeks, so calls read zero.`);
  }
  if (unclassified.length > 0) {
    warnings.push(`${unclassified.length} finished meetings in the last ${c.trendWeeks} weeks did not match the conversation rule. See "Check the rule".`);
  }

  return {
    conversations: {
      thisWeek: week.length,
      target: cfg.targets.conversationsPerWeek,
      lastWeek: inWeek(shiftWeeks(thisWeek, -1, cfg)).length,
      meetings: week.filter((x) => x.kind === 'meeting').length,
      calls: week.filter((x) => x.kind === 'call').length,
      uniqueAccounts: new Set(week.map((x) => x.accountId ?? (x.account ? `name:${x.account}` : null)).filter((x) => !blank(x))).size,
      uniqueContacts: new Set(week.map((x) => x.contactId).filter(Boolean)).size,
      bookedNext7Days: booked,
      trend,
      items: week,
      byDay,
    },
    calibration: { unclassifiedEvents: unclassified.sort((a, b) => b.start.localeCompare(a.start)).slice(0, 150) },
    warnings,
    all,
  };
}
