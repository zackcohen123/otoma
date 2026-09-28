import { describe, expect, it } from 'vitest';
import { canKeyset, fetchAll, keysetQuery } from '../lib/salesforce/paging';
import { clearPlanCache, parseZapierResult, resolveRunner } from '../lib/salesforce/zapier';

describe('keyset paging', () => {
  it('wraps an existing WHERE clause so OR keeps its meaning', () => {
    expect(keysetQuery('SELECT Id FROM Opportunity WHERE IsClosed = false OR CreatedDate >= 2026-01-01T00:00:00Z ORDER BY Id', '006A'))
      .toBe("SELECT Id FROM Opportunity WHERE Id > '006A' AND (IsClosed = false OR CreatedDate >= 2026-01-01T00:00:00Z) ORDER BY Id");
  });

  it('adds a WHERE clause when there is none, and ignores WHERE inside a subquery', () => {
    expect(keysetQuery('SELECT Id FROM Account ORDER BY Id', '001A')).toBe("SELECT Id FROM Account WHERE Id > '001A' ORDER BY Id");
    expect(keysetQuery("SELECT Id FROM Account WHERE Id NOT IN (SELECT AccountId FROM Contact WHERE AccountId != null) ORDER BY Id", '001A'))
      .toBe("SELECT Id FROM Account WHERE Id > '001A' AND (Id NOT IN (SELECT AccountId FROM Contact WHERE AccountId != null)) ORDER BY Id");
  });

  it('only pages non-aggregate queries ordered by Id', () => {
    expect(canKeyset('SELECT Id FROM Account ORDER BY Id')).toBe(true);
    expect(canKeyset('SELECT Id FROM Account ORDER BY Name')).toBe(false);
    expect(canKeyset('SELECT AccountId, COUNT(Id) c FROM Contact GROUP BY AccountId')).toBe(false);
  });

  it('fetches every page and warns when it cannot page a capped result', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ Id: `001${i}` }));
    const page = async (q: string) => {
      const after = q.match(/Id > '([^']+)'/)?.[1];
      return rows.filter((r) => !after || r.Id > after).slice(0, 3);
    };
    const warnings: string[] = [];
    expect(await fetchAll('SELECT Id FROM Account ORDER BY Id', page, 3, (w) => warnings.push(w))).toHaveLength(7);
    expect(warnings).toEqual([]);
    expect(await fetchAll('SELECT Id FROM Account ORDER BY Name', page, 3, (w) => warnings.push(w))).toHaveLength(3);
    expect(warnings[0]).toMatch(/may be truncated/);
  });
});

describe('Zapier responses', () => {
  const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], isError });

  it('reads rows and aggregate rows', () => {
    expect(parseZapierResult(text('{"results":[{"c":650}]}'), 'q')).toEqual([{ c: 650 }]);
    expect(parseZapierResult(text('{"results":[]}'), 'q')).toEqual([]);
  });

  it('turns SOQL errors into permanent errors and outages into transient ones', () => {
    try {
      parseZapierResult(text("Error during execution: \nERROR at Row:1:Column:8\nInvalid field: 'Type'", true), 'q');
      expect.fail();
    } catch (e: any) {
      expect(e.message).toMatch(/Invalid field/);
      expect(e.transient).toBe(false);
    }
    try {
      parseZapierResult(text('Upstream timed out', true), 'q');
      expect.fail();
    } catch (e: any) {
      expect(e.transient).toBe(true);
    }
  });

  it('treats the Zapier task limit as permanent, with a clear message', () => {
    const limit = { content: [{ type: 'text', text: '{"isError":true,"error":"Your Zapier account has reached its task limit for the current billing period."}' }], isError: true };
    try {
      parseZapierResult(limit, 'q');
      expect.fail();
    } catch (e: any) {
      expect(e.transient).toBe(false);
      expect(e.message).toMatch(/task limit reached/);
    }
  });

  it('puts the SOQL in the structured field for both server shapes', async () => {
    clearPlanCache();
    const calls: any[] = [];
    const reply = (t: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(t) }] });
    const direct = await resolveRunner(async (name, args) => (calls.push({ name, args }), reply({ results: [] })), [
      { name: 'salesforce_custom_soql_query', inputSchema: { properties: { instructions: {}, query_type: {}, soql_query: {} } } },
      { name: 'salesforce_update_record' },
    ]);
    await direct('SELECT Id FROM Account');
    expect(calls[0]).toMatchObject({ name: 'salesforce_custom_soql_query', args: { soql_query: 'SELECT Id FROM Account', query_type: 'custom' } });

    calls.length = 0;
    const meta = await resolveRunner(async (name, args) => {
      calls.push({ name, args });
      if (name === 'inspect_zapier_actions' && !args.selected_api) return reply({ apps: [{ app: 'Salesforce', selected_api: 'SalesforceCLIAPI' }] });
      if (name === 'inspect_zapier_actions') return reply([{ actions: [{ key: 'custom_soql_query', tool_name: 'salesforce_custom_soql_query', action_type: 'search' }] }]);
      return reply({ results: [{ c: 1 }] });
    }, [{ name: 'inspect_zapier_actions' }, { name: 'execute_zapier_read_action' }, { name: 'execute_zapier_write_action' }]);
    expect(await meta('SELECT COUNT(Id) c FROM Account')).toEqual([{ c: 1 }]);
    expect(calls.at(-1)).toMatchObject({
      name: 'execute_zapier_read_action',
      args: { params: { query_type: 'custom', dynamic_properties: { soql_query: 'SELECT COUNT(Id) c FROM Account' } } },
    });
    expect(calls.some((c) => /write/.test(c.name))).toBe(false);

    // A second refresh reuses the resolved action instead of looking it up again.
    calls.length = 0;
    const again = await resolveRunner(async (name, args) => (calls.push({ name, args }), reply({ results: [] })), [{ name: 'inspect_zapier_actions' }, { name: 'execute_zapier_read_action' }]);
    await again('SELECT Id FROM Account');
    expect(calls.map((c) => c.name)).toEqual(['execute_zapier_read_action']);
  });
});
