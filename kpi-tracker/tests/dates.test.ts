import { describe, expect, it } from 'vitest';
import { dateToInstant, localDate, monthStart, parseSf, quarterStart, shiftWeeks, soqlDateTime, weekStart } from '../lib/dates';
import { cfg } from './helpers';

const c = cfg();

describe('Europe/London boundaries', () => {
  it('starts the week on Monday at London midnight during BST', () => {
    // Sunday 27 Sep 23:30 UTC is Monday 00:30 in London, so it is already the new week.
    expect(weekStart(new Date('2026-09-27T23:30:00Z'), c).toISOString()).toBe('2026-09-27T23:00:00.000Z');
    // Sunday 27 Sep 22:30 UTC is still Sunday 23:30 in London.
    expect(weekStart(new Date('2026-09-27T22:30:00Z'), c).toISOString()).toBe('2026-09-20T23:00:00.000Z');
  });

  it('handles the October clock change', () => {
    const ws = weekStart(new Date('2026-10-28T12:00:00Z'), c); // week of Mon 26 Oct, after the change
    expect(ws.toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(shiftWeeks(ws, -1, c).toISOString()).toBe('2026-10-18T23:00:00.000Z');
  });

  it('computes month and quarter starts in London time', () => {
    expect(monthStart(new Date('2026-08-31T23:30:00Z'), c).toISOString()).toBe('2026-08-31T23:00:00.000Z'); // 1 Sep 00:30 BST
    expect(monthStart(new Date('2026-08-31T22:30:00Z'), c).toISOString()).toBe('2026-07-31T23:00:00.000Z');
    expect(quarterStart(new Date('2026-09-28T12:00:00Z'), c).toISOString()).toBe('2026-06-30T23:00:00.000Z');
  });

  it('respects a configurable week start', () => {
    const sunday = cfg((x) => (x.weekStartsOn = 0));
    expect(localDate(weekStart(new Date('2026-09-30T12:00:00Z'), sunday), sunday)).toBe('2026-09-27');
  });

  it('parses Salesforce datetimes and formats SOQL literals', () => {
    expect(parseSf('2026-09-28T15:30:00.000+0000')?.toISOString()).toBe('2026-09-28T15:30:00.000Z');
    expect(parseSf(null)).toBeNull();
    expect(soqlDateTime(new Date('2026-09-27T23:00:00.000Z'))).toBe('2026-09-27T23:00:00Z');
    expect(dateToInstant('2026-09-28', c).toISOString()).toBe('2026-09-27T23:00:00.000Z');
  });
});
