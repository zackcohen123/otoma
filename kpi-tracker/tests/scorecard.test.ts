import { describe, expect, it } from 'vitest';
import { displayLabel, money, relTime, toCsv } from '../lib/format';
import { refresh } from '../lib/refresh';
import { MockClient } from '../lib/salesforce/mock';
import { buildScorecard, topGaps } from '../lib/scorecard';
import { cfg, NOW } from './helpers';

describe('scorecard', () => {
  it('has the headline numbers, days, gaps and action lists', async () => {
    const c = cfg();
    const r = await refresh(new MockClient(NOW, c), c, NOW, []);
    const md = buildScorecard(r);
    expect(md).toMatch(/^# GTM weekly scorecard/);
    expect(md).toContain(`| Genuine conversations this week | ${r.headline.conversations.thisWeek} | 15 |`);
    expect(md).toContain('Target not set');
    expect(md).toContain('## Conversations by day');
    expect(md).toContain('## Top three gaps');
    expect(md).toContain('### Stalled opportunities');
    expect(topGaps(r).length).toBeLessThanOrEqual(3);
    expect(md).not.toMatch(/—/);
  });
});

describe('format', () => {
  it('formats money, ages and CSV', () => {
    expect(money(1_234_567)).toBe('£1.2m');
    expect(money(350_000)).toBe('£350k');
    expect(money(950)).toBe('£950');
    expect(relTime(12 * 60)).toBe('12 minutes ago');
    expect(relTime(30)).toBe('just now');
    expect(displayLabel('Engaged \u2014 Dormant')).toBe('Engaged, dormant');
    expect(displayLabel('Active Opportunity')).toBe('Active Opportunity');
    expect(toCsv([{ name: 'Bank, "Big"', region: 'UK' }], ['name', 'region'])).toBe('name,region\n"Bank, ""Big""",UK');
  });
});
