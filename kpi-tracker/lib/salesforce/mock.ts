// MockClient: serves fixtures for MOCK=1, with scenarios to show the warning states.
//   MOCK_SCENARIO=ok (default) | truncated | empty | error
import type { KpiConfig } from '../../config/kpi.config';
import { assertSelectOnly } from '../soql-guard';
import type { Row } from '../types';
import { SoqlError, type SalesforceClient } from './client';
import { makeFixtures, type Fixtures } from './fixtures';
import { fetchAll } from './paging';

export type MockScenario = 'ok' | 'truncated' | 'empty' | 'error';

/** Which fixture set answers a query. */
export function routeQuery(q: string): keyof Fixtures {
  if (/\bFROM Event\b/i.test(q)) return 'events';
  if (/\bFROM Task\b/i.test(q)) return 'calls';
  if (/\bFROM OpportunityContactRole\b/i.test(q)) return 'contactRoles';
  if (/\bFROM Opportunity\b/i.test(q)) return 'opportunities';
  if (/\bFROM Account\b/i.test(q)) return 'accounts';
  if (/\bFROM PicklistValueInfo\b/i.test(q)) return 'personaValues';
  if (/\bFROM CampaignMember\b/i.test(q)) return 'campaign';
  if (/\bFROM Contact\b/i.test(q)) return 'contacts';
  throw new SoqlError('Mock has no fixture for this query', q);
}

export class MockClient implements SalesforceClient {
  readonly source = 'mock' as const;
  private fixtures: Fixtures;
  private warnings: string[] = [];
  private calls = 0;
  private cap: number;
  private maxPages: number;

  constructor(now: Date, cfg: KpiConfig, private scenario: MockScenario = 'ok') {
    this.fixtures = makeFixtures(now, cfg);
    // The truncated scenario uses a tiny page cap and page limit so paging gives up.
    this.cap = scenario === 'truncated' ? 20 : cfg.zapier.rowCap;
    this.maxPages = scenario === 'truncated' ? 2 : 25;
  }

  private async page(q: string): Promise<Row[]> {
    this.calls++;
    const key = routeQuery(q);
    if (this.scenario === 'error' && key === 'opportunities') {
      throw new SoqlError('Mock error: Zapier MCP request failed (simulated outage)', q, true);
    }
    if (this.scenario === 'empty') return [];
    const after = q.match(/Id > '([^']+)'/)?.[1];
    const rows = [...this.fixtures[key]]
      .filter((r) => !after || String(r.Id) > after)
      .sort((a, b) => String(a.Id ?? '').localeCompare(String(b.Id ?? '')));
    return rows.slice(0, this.cap);
  }

  soql(query: string) {
    return fetchAll(assertSelectOnly(query), (q) => this.page(q), this.cap, (w) => this.warnings.push(w), this.maxPages);
  }

  drainWarnings() {
    const w = this.warnings;
    this.warnings = [];
    return w;
  }

  stats() {
    return { calls: this.calls, ms: 0 };
  }

  async close() {}
}
