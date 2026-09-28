import { describe, expect, it } from 'vitest';
import { calcCoverage } from '../lib/calc/coverage';
import { calcHealth } from '../lib/calc/health';
import { cfg, NOW } from './helpers';

const c = cfg();
const acct = (id: string, over: Record<string, any> = {}) => ({ Id: id, Name: id, TAM_Segment__c: 'Priority TAM', Region__c: 'Europe', Relationship_Status__c: 'Not Engaged', ...over });
const contact = (id: string, accountId: string, over: Record<string, any> = {}) => ({
  Id: id, Name: id, AccountId: accountId, Account: { Name: accountId },
  Contact_Persona__c: 'Operations', Seniority__c: 'Director', LinkedIn_URL__c: 'x', Email: `${id}@x.example`, Title: 'CTO', ...over,
});

const accounts = [
  acct('A1', { Relationship_Status__c: 'Engaged', Last_Meaningful_Interaction_Date__c: '2026-09-20' }),
  acct('A2', { Relationship_Status__c: 'Active Opportunity', Last_Meaningful_Interaction_Date__c: '2026-07-01', Region__c: null }),
  acct('A3'),
  acct('A4', { Relationship_Status__c: null }),
  acct('W1', { TAM_Segment__c: 'Wider TAM' }),
];
const contacts = [contact('C1', 'A1'), contact('C2', 'A1'), contact('C3', 'A1', { Seniority__c: null }), contact('C4', 'A2', { Contact_Persona__c: 'Transformation' })];

describe('coverage', () => {
  const cov = calcCoverage({ accounts, priorityContacts: contacts, personaValues: [{ Value: 'Operations' }, { Value: 'Transformation' }, { Value: 'Risk/Resilience' }] }, c, [{ weekStart: '2026-09-21', engagementRate: 25 }], '2026-09-28');

  it('counts priority accounts, statuses, regions and contact buckets', () => {
    expect(cov.priorityTotal).toBe(4);
    expect(cov.byStatus).toEqual({ Engaged: 1, 'Active Opportunity': 1, 'Not Engaged': 1, '(blank)': 1 });
    expect(cov.byRegion).toEqual({ Europe: 3, '(blank)': 1 });
    expect(cov.contactBuckets).toEqual({ '0': 2, '1-2': 1, '3-4': 1, '5+': 0 });
    expect(cov.noContacts.map((a) => a.id)).toEqual(['A3', 'A4']);
  });

  it('reads persona values from the picklist, including unused ones', () => {
    expect(cov.personaGaps).toEqual({ Operations: 3, Transformation: 3, 'Risk/Resilience': 4 });
  });

  it('treats blank status as not engaged and appends the current week to the trend', () => {
    expect(cov.engagementRate).toBe(50);
    expect(cov.engagementTrend).toEqual([{ weekStart: '2026-09-21', rate: 25 }, { weekStart: '2026-09-28', rate: 50 }]);
  });
});

describe('CRM health', () => {
  const base = {
    accounts, priorityContacts: contacts, contactRoles: [], warmIntros: [], activeNoNextAction: [],
    duplicateEmails: [{ Email: 'dup@x.example', c: 2 }], duplicateContacts: [{ Id: 'D1', Name: 'Dup', Email: 'dup@x.example' }, { Id: 'D2', Name: 'Dup', Email: 'dup@x.example' }],
    emailTotal: 10,
  };
  const openOpp = (over: Record<string, any> = {}) => ({ Id: 'O1', Name: 'Opp', IsClosed: false, StageName: '2. Interest', Amount: 1, CloseDate: '2026-12-01', NextStep: 'x', LastActivityDate: '2026-09-25', Budget_Confirmed__c: true, Authority_Confirmed__c: true, Need_Confirmed__c: true, Timeline_Confirmed__c: true, ...over });

  it('computes each metric and a weighted score', () => {
    const h = calcHealth({ ...base, opportunities: [openOpp()] }, NOW, c);
    const m = Object.fromEntries(h.metrics.map((x) => [x.key, x]));
    expect(m.priorityWithContact.passRate).toBe(50);
    expect(m.priorityWithMinContacts.passRate).toBe(25);
    expect(m.contactCompleteness.passRate).toBe(75);
    expect(m.bantCompleteness.passRate).toBe(100);
    expect(m.multiThreading.passRate).toBe(0);
    expect(m.oppHygiene.passRate).toBe(100);
    expect(m.freshness.passRate).toBe(50);
    expect(m.duplicateContacts).toMatchObject({ passRate: 80, passed: 8, total: 10 });
    expect(m.priorityWithContact.failing.map((f) => f.id)).toEqual(['A3', 'A4']);
    expect(m.priorityWithContact.failing[0].url).toBe('https://energy-flow-1774.lightning.force.com/A3');
    const expected = Math.round((50 * 20 + 25 * 15 + 75 * 15 + 100 * 15 + 0 * 10 + 100 * 10 + 50 * 10 + 80 * 5) / 100);
    expect(h.score).toBe(expected);
    expect(h.rag).toBe('red');
  });

  it('leaves metrics with nothing to measure out of the score', () => {
    const h = calcHealth({ ...base, opportunities: [] }, NOW, c);
    expect(h.metrics.find((x) => x.key === 'bantCompleteness')?.total).toBe(0);
    const expected = Math.round((50 * 20 + 25 * 15 + 75 * 15 + 50 * 10 + 80 * 5) / 65);
    expect(h.score).toBe(expected);
  });

  it('builds stalled and overdue opportunity lists', () => {
    const h = calcHealth({ ...base, opportunities: [openOpp({ Id: 'S', LastActivityDate: '2026-09-01', CloseDate: '2026-09-01' }), openOpp({ Id: 'N', LastActivityDate: null })] }, NOW, c);
    expect(h.actionLists.stalledOpps.map((a) => a.id).sort()).toEqual(['N', 'S']);
    expect(h.actionLists.overdueOpps.map((a) => a.id)).toEqual(['S']);
    expect(h.actionLists.stalledOpps.find((a) => a.id === 'N')?.detail).toMatch(/no activity logged/);
  });
});
