import { describe, expect, it } from 'vitest';
import { buildDefinitions } from '../lib/definitions';
import { buildQueries } from '../lib/queries';
import { refresh } from '../lib/refresh';
import { MockClient, routeQuery } from '../lib/salesforce/mock';
import { cfg, NOW } from './helpers';

const c = cfg();

describe('mock client and refresh', () => {
  it('routes every query in the library to a fixture', () => {
    const withCampaign = cfg((x) => (x.campaign.nameLike = 'Buy Atlas'));
    for (const q of buildQueries(NOW, withCampaign)) expect(routeQuery(q.soql)).toBe(q.key);
  });

  it('builds a full response from fixtures', async () => {
    const r = await refresh(new MockClient(NOW, c), c, NOW, []);
    expect(r.source).toBe('mock');
    expect(r.coverage.priorityTotal).toBeGreaterThan(20);
    expect(r.headline.conversations.trend).toHaveLength(8);
    expect(r.headline.conversations.thisWeek).toBeGreaterThan(0);
    expect(r.crmHealth.metrics).toHaveLength(8);
    expect(r.crmHealth.score).toBeGreaterThan(0);
    expect(r.headline.pipeline.target).toBeNull();
    expect(r.headline.campaign).toBeNull();
    expect(r.meta.queryCount).toBeGreaterThan(5);
    expect(r.warnings.some((w) => /truncated/.test(w))).toBe(false);
  });

  it('shows a truncation warning', async () => {
    const r = await refresh(new MockClient(NOW, c, 'truncated'), c, NOW, []);
    expect(r.warnings.some((w) => /truncated/.test(w))).toBe(true);
  });

  it('handles empty results without crashing', async () => {
    const r = await refresh(new MockClient(NOW, c, 'empty'), c, NOW, []);
    expect(r.coverage.priorityTotal).toBe(0);
    expect(r.headline.conversations.thisWeek).toBe(0);
    expect(r.warnings.some((w) => /No accounts/.test(w))).toBe(true);
  });

  it('fails the refresh on an error so the last good data is kept', async () => {
    await expect(refresh(new MockClient(NOW, c, 'error'), c, NOW, [])).rejects.toThrow(/simulated outage/);
  });

  it('shows the campaign card only when configured', async () => {
    const withCampaign = cfg((x) => (x.campaign.nameLike = 'Buy Atlas'));
    const r = await refresh(new MockClient(NOW, withCampaign), withCampaign, NOW, []);
    expect(r.headline.campaign).toMatchObject({ name: 'Buy Atlas', members: 14 });
  });
});

describe('definitions', () => {
  it('are generated from config', () => {
    expect(buildDefinitions(c)).toMatchSnapshot();
  });

  it('change when config changes', () => {
    const d = buildDefinitions(cfg((x) => { x.targets.bookingsTarget = 400000; x.qualification.qualifiedMinBant = 3; }));
    expect(d.pipeline).toMatch(/£1,200,000/);
    expect(d.qualifiedOpps).toMatch(/at least 3 of the 4/);
  });

  it('contain no em dashes', () => {
    expect(JSON.stringify(buildDefinitions(c))).not.toMatch(/—/);
  });
});
