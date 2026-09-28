import { describe, expect, it } from 'vitest';
import { accountMatcher, calcConversations, classifyCall, classifyEvent } from '../lib/calc/conversations';
import { accounts, call, cfg, event, NOW } from './helpers';

const c = cfg();
const match = accountMatcher(accounts, c);
const run = (events: any[], calls: any[] = [], conf = c, now = NOW) => calcConversations({ events, calls, accounts }, now, conf);

// "This week" at NOW starts Monday 28 Sep 2026 00:00 London = 27 Sep 23:00 UTC.
const thisWeekEvent = (over: Record<string, any> = {}) =>
  event({ StartDateTime: '2026-09-28T08:00:00.000+0000', EndDateTime: '2026-09-28T08:30:00.000+0000', ...over });

describe('meetings', () => {
  it('counts a Teams meeting once, even if the row appears twice', () => {
    const e = thisWeekEvent({ Id: '00UDUP' });
    const r = run([e, { ...e }]);
    expect(r.conversations.thisWeek).toBe(1);
    expect(r.conversations.meetings).toBe(1);
    expect(r.conversations.uniqueAccounts).toBe(1);
    expect(r.conversations.uniqueContacts).toBe(1);
  });

  it('excludes a future meeting but counts it as booked in the next 7 days', () => {
    const r = run([thisWeekEvent({ StartDateTime: '2026-09-29T09:00:00.000+0000', EndDateTime: '2026-09-29T09:30:00.000+0000' })]);
    expect(r.conversations.thisWeek).toBe(0);
    expect(r.conversations.bookedNext7Days).toBe(1);
  });

  it('excludes a meeting that has started but not finished', () => {
    const r = run([thisWeekEvent({ StartDateTime: '2026-09-28T12:45:00.000+0000', EndDateTime: '2026-09-28T13:15:00.000+0000' })]);
    expect(r.conversations.thisWeek).toBe(0);
  });

  it('excludes cancelled meetings', () => {
    const v = classifyEvent(event({ Subject: 'Canceled: Barclays discovery call' }), NOW, c, match);
    expect(v).toMatchObject({ kind: 'rejected', reason: 'cancelled or declined' });
  });

  it('excludes all-day events and keeps them out of the calibration table', () => {
    const r = run([thisWeekEvent({ IsAllDayEvent: true, DurationInMinutes: 1440 })]);
    expect(r.conversations.thisWeek).toBe(0);
    expect(r.calibration.unclassifiedEvents).toHaveLength(0);
  });

  it('excludes meetings shorter than the minimum', () => {
    const v = classifyEvent(event({ DurationInMinutes: 5 }), NOW, c, match);
    expect(v).toMatchObject({ kind: 'rejected', reason: 'shorter than 10 minutes' });
  });

  it('excludes internal-only meetings', () => {
    const internalAccount = classifyEvent(event({ WhoId: null, AccountId: '001OTO', Account: { Name: 'Otoma' } }), NOW, c, match);
    expect(internalAccount).toMatchObject({ kind: 'rejected', reason: 'internal account' });
    const oneToOne = classifyEvent(event({ Subject: 'Zack and Peter: weekly 1:1', WhoId: null, AccountId: null, Account: null }), NOW, c, match);
    expect(oneToOne).toMatchObject({ kind: 'rejected', reason: 'no external contact or account' });
  });

  it('requires a Teams, video or call signal', () => {
    const v = classifyEvent(event({ Subject: 'Barclays!', Location: null }), NOW, c, match);
    expect(v).toMatchObject({ kind: 'rejected', reason: 'no Teams, video or call signal' });
  });

  it('rule (b): counts an unlinked meeting whose subject names an account or alias', () => {
    const byName = classifyEvent(event({ Subject: 'Otoma / National Bank of Greece: DLT', WhoId: null, AccountId: null, Account: null }), NOW, c, match);
    expect(byName).toMatchObject({ kind: 'qualified', item: { account: 'National Bank of Greece', matchedBy: 'subject' } });
    const byAlias = classifyEvent(event({ Subject: 'Otoma / NBG: Payments Transformation', WhoId: null, AccountId: null, Account: null }), NOW, c, match);
    expect(byAlias).toMatchObject({ kind: 'qualified', item: { accountId: '001NBG' } });
    const bySuffixlessName = classifyEvent(event({ Subject: 'Deutsche Bank intro', WhoId: null, AccountId: null, Account: null, Location: null }), NOW, c, match);
    expect(bySuffixlessName).toMatchObject({ kind: 'qualified', item: { accountId: '001DB' } });
    const external = classifyEvent(event({ Subject: '[External]---Otoma and Alex Doe', Location: 'https://us06web.zoom.us/j/1', WhoId: null, AccountId: null, Account: null }), NOW, c, match);
    expect(external).toMatchObject({ kind: 'qualified', item: { account: null } });
  });

  it('counts an in-person Sibos meeting at a stand', () => {
    const v = classifyEvent(event({ Subject: '[External]---Lloyds and Otoma meeting', Location: 'Meet at the Lloyds stand' }), NOW, c, match);
    expect(v.kind).toBe('qualified');
  });

  it('rule (b) can be switched off', () => {
    const strict = cfg((x) => (x.conversations.matchUnlinkedBySubject = false));
    const v = classifyEvent(event({ Subject: 'NBG catch up', WhoId: null, AccountId: null, Account: null }), NOW, strict, accountMatcher(accounts, strict));
    expect(v.kind).toBe('rejected');
  });

  it('does not match an account name inside another word', () => {
    expect(match('Hsbcx planning')).toBeNull();
    expect(match('Catch up with HSBC team')?.id).toBe('001HSBC');
  });

  it('builds an 8-week trend with the Sibos marker on the right week', () => {
    const r = run([thisWeekEvent()]);
    expect(r.conversations.trend).toHaveLength(8);
    const last = r.conversations.trend.at(-1)!;
    expect(last).toMatchObject({ weekStart: '2026-09-28', count: 1, sibos: true });
    expect(r.conversations.trend.filter((t) => t.sibos)).toHaveLength(1);
  });

  it('lists unmatched finished meetings in the calibration table', () => {
    const r = run([event({ Id: '00UX', Subject: 'Yaniv <> Zack', WhoId: null, AccountId: null, Account: null })]);
    expect(r.calibration.unclassifiedEvents.map((u) => u.id)).toEqual(['00UX']);
  });
});

describe('calls', () => {
  it('excludes a call under the minimum duration', () => {
    expect(classifyCall(call({ CallDurationInSeconds: 45 }), c)).toBeNull();
  });

  it('counts a call with no recorded duration', () => {
    expect(classifyCall(call({ CallDurationInSeconds: null }), c)).not.toBeNull();
  });

  it('excludes calls with no contact or account, and internal ones', () => {
    expect(classifyCall(call({ WhoId: null, AccountId: null, Account: null }), c)).toBeNull();
    expect(classifyCall(call({ Account: { Name: 'Otoma' } }), c)).toBeNull();
  });

  it('buckets a call by its London activity date', () => {
    const r = run([], [call({ ActivityDate: '2026-09-28' }), call({ ActivityDate: '2026-09-27' })]);
    expect(r.conversations.calls).toBe(1);
    expect(r.conversations.lastWeek).toBe(1);
  });

  it('warns when no calls are logged', () => {
    expect(run([]).warnings.join(' ')).toMatch(/No completed calls/);
  });
});
