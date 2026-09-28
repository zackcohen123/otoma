import { describe, expect, it } from 'vitest';
import { bant, calcPipeline, calcPipelineDetail, calcQualifiedOpps, isConfirmed } from '../lib/calc/opportunities';
import { cfg, NOW } from './helpers';

const c = cfg();
const opp = (over: Record<string, any> = {}) => ({
  Id: over.Id ?? `006${Math.random().toString(36).slice(2, 10)}`,
  Name: 'Opp',
  StageName: '2. Interest',
  Amount: 100000,
  Probability: 20,
  CreatedDate: '2026-09-10T10:00:00.000+0000',
  IsClosed: false,
  IsWon: false,
  Budget_Confirmed__c: true,
  Authority_Confirmed__c: true,
  Need_Confirmed__c: true,
  Timeline_Confirmed__c: true,
  ...over,
});

describe('BANT', () => {
  it('treats checkbox true and positive picklist values as confirmed', () => {
    expect(isConfirmed(true, c)).toBe(true);
    expect(isConfirmed(false, c)).toBe(false);
    expect(isConfirmed('Yes', c)).toBe(true);
    expect(isConfirmed('Confirmed', c)).toBe(true);
    expect(isConfirmed('No', c)).toBe(false);
    expect(isConfirmed(null, c)).toBe(false);
    expect(bant(opp({ Budget_Confirmed__c: 'Yes', Need_Confirmed__c: false }), c)).toEqual({ count: 3, missing: ['Need'] });
  });

  it('applies the configurable threshold', () => {
    const threeOfFour = [opp({ Timeline_Confirmed__c: false })];
    expect(calcQualifiedOpps(threeOfFour, NOW, c).thisMonth).toBe(0);
    expect(calcQualifiedOpps(threeOfFour, NOW, cfg((x) => (x.qualification.qualifiedMinBant = 3))).thisMonth).toBe(1);
  });

  it('uses London month boundaries and lists missing elements', () => {
    // 31 Aug 23:30 UTC is 1 Sep 00:30 in London, so it belongs to September.
    const r = calcQualifiedOpps([opp({ CreatedDate: '2026-08-31T23:30:00.000+0000' }), opp({ CreatedDate: '2026-08-31T22:30:00.000+0000' }), opp({ Name: 'Half', Authority_Confirmed__c: false, Need_Confirmed__c: false })], NOW, c);
    expect(r.thisMonth).toBe(1);
    expect(r.lastMonth).toBe(1);
    expect(r.trend.map((t) => t.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(r.items.find((i) => i.name === 'Half')?.missing).toEqual(['Authority', 'Need']);
  });
});

describe('pipeline', () => {
  it('sums open and won pipeline created this quarter and excludes closed lost', () => {
    const r = calcPipeline([
      opp({ Amount: 100000 }),
      opp({ Amount: 50000, IsClosed: true, IsWon: true }),
      opp({ Amount: 70000, IsClosed: true, IsWon: false }),
      opp({ Amount: null }),
      opp({ Amount: 999, CreatedDate: '2026-06-30T22:30:00.000+0000' }), // 30 Jun 23:30 London, previous quarter
    ], NOW, c);
    expect(r.createdThisQuarter).toBe(150000);
    expect(r.createdLastQuarter).toBe(999);
    expect(r.quarterLabel).toBe('Q3 2026');
  });

  it('never invents a target when bookings target is null', () => {
    expect(calcPipeline([opp()], NOW, c).target).toBeNull();
    expect(calcPipeline([opp()], NOW, cfg((x) => (x.targets.bookingsTarget = 500000))).target).toBe(1500000);
  });

  it('groups open pipeline by stage with a weighted value', () => {
    const d = calcPipelineDetail([opp({ StageName: '1. Targeting', Amount: 10000, Probability: 10 }), opp({ StageName: '10. Late' }), opp({ IsClosed: true })], c);
    expect(d.byStage.map((s) => s.stage)).toEqual(['1. Targeting', '10. Late']);
    expect(d.weighted).toBe(1000 + 20000);
    expect(d.bantDistribution['4']).toBe(2);
    expect(calcPipelineDetail([opp({ Probability: null })], c).weighted).toBeNull();
  });
});
