// Run all queries (in parallel, the client limits concurrency) and build the response.
import type { KpiConfig } from '../config/kpi.config';
import { buildResponse, type DataSet, type HistoryRow } from './build';
import { buildQueries, type QueryKey } from './queries';
import type { SalesforceClient } from './salesforce/client';
import type { KpiResponse, Row } from './types';

export async function refresh(client: SalesforceClient, cfg: KpiConfig, now: Date, history: HistoryRow[]): Promise<KpiResponse> {
  const t0 = Date.now();
  const warnings: string[] = [];
  const specs = buildQueries(now, cfg);
  const results = await Promise.all(
    specs.map(async (s) => {
      try {
        return [s.key, await client.soql(s.soql)] as const;
      } catch (e) {
        if (!s.optional) throw new Error(`Query "${s.key}" failed: ${(e as Error).message}`);
        warnings.push(`Optional query "${s.key}" failed, so that section may be incomplete: ${(e as Error).message}`);
        return [s.key, null] as const;
      }
    }),
  );
  const got = Object.fromEntries(results) as Partial<Record<QueryKey, Row[] | null>>;

  const data: DataSet = {
    events: got.events ?? [],
    calls: got.calls ?? [],
    opportunities: got.opportunities ?? [],
    contactRoles: got.contactRoles ?? [],
    accounts: got.accounts ?? [],
    contacts: got.contacts ?? [],
    personaValues: got.personaValues ?? [],
    campaign: got.campaign ?? null,
  };
  if (data.accounts.length === 0) warnings.push('No accounts came back from Salesforce. Check the Zapier connection user can see Accounts.');

  warnings.push(...client.drainWarnings());
  const stats = client.stats();
  return buildResponse(data, {
    now,
    cfg,
    source: client.source,
    history,
    warnings,
    queryCount: stats.calls,
    durationMs: Date.now() - t0,
  });
}
