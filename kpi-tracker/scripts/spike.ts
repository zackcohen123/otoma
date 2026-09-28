// Phase 0 connection spike: npm run spike
// Connects to the Zapier MCP server, finds the SOQL tool, and runs the discovery queries.
// Read-only: every query goes through assertSelectOnly, every tool through assertReadOnlyTool.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { assertReadOnlyTool, assertSelectOnly } from '../lib/soql-guard';

type Tool = { name: string; description?: string; inputSchema: any };
type CallResult = { ok: boolean; rows: any[]; raw: unknown; error?: string; ms: number };

const url = process.env.ZAPIER_MCP_URL;
if (!url) {
  console.error('ZAPIER_MCP_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
// Never print the URL: its path carries the secret.
const redacted = (s: string) => s.split(url).join('<ZAPIER_MCP_URL>');
const headers: Record<string, string> = process.env.ZAPIER_MCP_TOKEN
  ? { Authorization: `Bearer ${process.env.ZAPIER_MCP_TOKEN}` }
  : {};

const hr = (title: string) => console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
const show = (v: unknown, max = 4000) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  console.log(redacted(s.length > max ? `${s.slice(0, max)}\n… (${s.length} chars, truncated for display)` : s));
};

async function connect(): Promise<Client> {
  const client = new Client({ name: 'otoma-gtm-kpis-spike', version: '0.0.1' });
  const t0 = Date.now();
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url!), { requestInit: { headers } }));
    console.log(`Connected over Streamable HTTP in ${Date.now() - t0} ms`);
  } catch (e) {
    console.log(`Streamable HTTP failed (${(e as Error).message}); trying SSE`);
    const legacy = new Client({ name: 'otoma-gtm-kpis-spike', version: '0.0.1' });
    await legacy.connect(new SSEClientTransport(new URL(url!), { requestInit: { headers } }));
    console.log(`Connected over SSE in ${Date.now() - t0} ms`);
    return legacy;
  }
  return client;
}

// Zapier returns MCP text content that is usually JSON: {"results":[...]} on success.
function parse(res: any): { rows: any[]; error?: string } {
  const text = (res?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* plain text */ }
  if (res?.isError || (typeof body === 'string' && /error/i.test(body))) {
    return { rows: [], error: typeof body === 'string' ? body : JSON.stringify(body) };
  }
  if (body && typeof body === 'object' && body.isError) return { rows: [], error: String(body.error ?? JSON.stringify(body)) };
  const rows = Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : [];
  return { rows };
}

async function main() {
  const client = await connect();

  hr('1. Salesforce tools');
  const t0 = Date.now();
  const { tools } = (await client.listTools()) as { tools: Tool[] };
  console.log(`listTools: ${tools.length} tools in ${Date.now() - t0} ms`);
  for (const t of tools.filter((t) => /salesforce/i.test(`${t.name} ${t.description ?? ''}`))) {
    console.log(`- ${t.name}: ${(t.description ?? '').slice(0, 140)}`);
  }

  // Two shapes exist. Classic Zapier MCP servers expose one tool per enabled action
  // (e.g. salesforce_custom_soql_query). Newer ones expose meta tools
  // (inspect_zapier_actions + execute_zapier_read_action). Support both.
  const direct = tools.find((t) => /soql/i.test(t.name) && !/sosl/i.test(t.name));
  const inspect = tools.find((t) => t.name === 'inspect_zapier_actions');
  const execRead = tools.find((t) => t.name === 'execute_zapier_read_action');

  let runSoql: (q: string) => Promise<CallResult>;

  if (direct) {
    hr(`2. SOQL tool (direct): ${direct.name}`);
    assertReadOnlyTool(direct.name);
    show(direct.inputSchema);
    const props = direct.inputSchema?.properties ?? {};
    const queryKey = ['soql_query', 'query', 'soql'].find((k) => k in props)
      ?? Object.keys(props).find((k) => /query|soql/i.test(k));
    if (!queryKey) throw new Error('Could not find the query field in the SOQL tool schema');
    console.log(`Query field: ${queryKey}`);
    runSoql = async (q) => {
      const args: Record<string, unknown> = { [queryKey]: assertSelectOnly(q) };
      if ('query_type' in props) args.query_type = 'custom';
      if ('instructions' in props) args.instructions = `Run exactly this SOQL SELECT query and return the raw rows: ${q}`;
      if ('output_hint' in props) args.output_hint = 'all rows, all fields, as JSON';
      const s = Date.now();
      const raw = await client.callTool({ name: direct.name, arguments: args });
      const p = parse(raw);
      return { ...p, ok: !p.error, raw, ms: Date.now() - s };
    };
  } else if (inspect && execRead) {
    hr('2. SOQL tool (via execute_zapier_read_action)');
    assertReadOnlyTool(inspect.name);
    assertReadOnlyTool(execRead.name);
    console.log('execute_zapier_read_action inputSchema:');
    show(execRead.inputSchema);
    const s = Date.now();
    const raw: any = await client.callTool({ name: inspect.name, arguments: {} });
    const apps = JSON.parse(raw.content[0].text).apps as any[];
    const app = apps.find((a) => /salesforce/i.test(a.app));
    if (!app) throw new Error('Salesforce is not enabled on this Zapier MCP server');
    const detailRaw: any = await client.callTool({
      name: inspect.name,
      arguments: { selected_api: app.selected_api, action: 'custom_soql_query', params: { query_type: 'custom' } },
    });
    const detail = JSON.parse(detailRaw.content[0].text)[0].actions.find((a: any) => /soql/i.test(a.key));
    if (!detail) throw new Error('Custom SOQL Query action is not enabled for Salesforce in Zapier');
    console.log(`Action: ${detail.key} (tool_name ${detail.tool_name}, type ${detail.action_type}), resolved in ${Date.now() - s} ms`);
    console.log('Action params:');
    show({ params: detail.params, dynamic_properties_schema: detail.dynamic_properties_schema });
    runSoql = async (q) => {
      const args = {
        selected_api: app.selected_api,
        action: detail.key,
        tool_name: detail.tool_name,
        params: { query_type: 'custom', dynamic_properties: { soql_query: assertSelectOnly(q) } },
      };
      const t = Date.now();
      const raw = await client.callTool({ name: execRead.name, arguments: args });
      const p = parse(raw);
      return { ...p, ok: !p.error, raw, ms: Date.now() - t };
    };
  } else {
    throw new Error('No SOQL tool found. Enable Salesforce "Custom SOQL Query" in the Zapier MCP server.');
  }

  const latencies: number[] = [];
  const run = async (label: string, q: string, opts: { raw?: boolean; rowsMax?: number } = {}) => {
    console.log(`\n-- ${label}\n   ${q}`);
    try {
      const r = await runSoql(q);
      latencies.push(r.ms);
      if (!r.ok) { console.log(`   ERROR (${r.ms} ms): ${redacted(r.error ?? '')}`); return r; }
      console.log(`   ${r.rows.length} row(s) in ${r.ms} ms`);
      if (opts.raw) show(r.raw);
      else show(r.rows.slice(0, opts.rowsMax ?? 50).map(({ attributes, ...rest }: any) => rest));
      return r;
    } catch (e) {
      console.log(`   THREW: ${redacted((e as Error).message)}`);
      return undefined;
    }
  };

  hr('3. Counts');
  await run('COUNT() (bare, returns totalSize only in the REST API)', 'SELECT COUNT() FROM Account', { raw: true });
  await run('COUNT(Id) alias', 'SELECT COUNT(Id) c FROM Account');

  hr('4. Raw response shape (LIMIT 3)');
  await run('Rows', 'SELECT Id, Name, TAM_Segment__c, Relationship_Status__c FROM Account ORDER BY Id LIMIT 3', { raw: true });
  await run('Error shape', 'SELECT Nonexistent_Field__c FROM Account LIMIT 1', { raw: true });

  hr('5. Row cap and pagination');
  const big = await run('Unbounded Id pull (Contact)', 'SELECT Id FROM Contact ORDER BY Id', { rowsMax: 0 });
  if (big?.ok) {
    const raw: any = big.raw;
    const keys = Object.keys(JSON.parse(raw.content?.[0]?.text ?? '{}'));
    console.log(`   Top-level keys: ${keys.join(', ')}; last Id: ${big.rows.at(-1)?.Id}`);
    const next = await run('Keyset page 2', `SELECT Id FROM Contact WHERE Id > '${big.rows.at(-1)?.Id}' ORDER BY Id`, { rowsMax: 0 });
    if (next?.ok) console.log(`   Keyset total: ${big.rows.length + next.rows.length}`);
  }

  hr('6. Discovery queries (brief section 5.1)');
  const discovery = [
    'SELECT Type, COUNT(Id) c FROM Event GROUP BY Type',
    'SELECT TaskSubtype, Status, COUNT(Id) c FROM Task GROUP BY TaskSubtype, Status',
    "SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND QualifiedApiName LIKE '%__c'",
    'SELECT StageName, COUNT(Id) c FROM Opportunity GROUP BY StageName',
    'SELECT Contact_Persona__c, COUNT(Id) c FROM Contact GROUP BY Contact_Persona__c',
    'SELECT Relationship_Status__c, COUNT(Id) c FROM Account GROUP BY Relationship_Status__c',
    'SELECT COUNT(Id) c FROM Event WHERE StartDateTime = LAST_N_DAYS:60',
    "SELECT COUNT(Id) c FROM Task WHERE TaskSubtype = 'Call' AND ActivityDate = LAST_N_DAYS:60",
  ];
  for (const q of discovery) await run('Discovery', q);

  hr('7. Extra checks');
  await run('Priority TAM accounts (expect 142)', "SELECT COUNT(Id) c FROM Account WHERE TAM_Segment__c = 'Priority TAM'");
  await run('Priority TAM with no contacts (expect 25)',
    "SELECT COUNT(Id) c FROM Account WHERE TAM_Segment__c = 'Priority TAM' AND Id NOT IN (SELECT AccountId FROM Contact WHERE AccountId != null)");
  await run('Event linkage, last 60 days',
    'SELECT IsAllDayEvent, Who.Type, COUNT(Id) c FROM Event WHERE StartDateTime = LAST_N_DAYS:60 GROUP BY IsAllDayEvent, Who.Type');
  await run('Timed events with an AccountId, last 60 days',
    'SELECT COUNT(Id) c FROM Event WHERE StartDateTime = LAST_N_DAYS:60 AND IsAllDayEvent = false AND AccountId != null');
  await run('Event attendees (EventRelation), last 60 days',
    'SELECT Relation.Type, IsInvitee, COUNT(Id) c FROM EventRelation WHERE Event.StartDateTime = LAST_N_DAYS:60 GROUP BY Relation.Type, IsInvitee');
  await run('Event locations, last 60 days',
    'SELECT Location, COUNT(Id) c FROM Event WHERE StartDateTime = LAST_N_DAYS:60 AND IsAllDayEvent = false GROUP BY Location ORDER BY COUNT(Id) DESC LIMIT 15');
  await run('Campaigns', 'SELECT Name, IsActive, COUNT(Id) c FROM Campaign GROUP BY Name, IsActive');

  hr('8. Concurrency (4 parallel calls)');
  const p0 = Date.now();
  const par = await Promise.allSettled(Array.from({ length: 4 }, () => runSoql('SELECT COUNT(Id) c FROM Opportunity')));
  console.log(`   ${par.filter((p) => p.status === 'fulfilled' && p.value.ok).length}/4 succeeded, wall time ${Date.now() - p0} ms`);
  for (const p of par) if (p.status === 'rejected' || !p.value.ok) console.log(`   ${redacted(String(p.status === 'rejected' ? p.reason : p.value.error))}`);

  hr('Summary');
  const sorted = [...latencies].sort((a, b) => a - b);
  console.log(`SOQL calls: ${latencies.length}; latency min ${sorted[0]} ms, median ${sorted[Math.floor(sorted.length / 2)]} ms, max ${sorted.at(-1)} ms`);
  await client.close();
}

main().catch((e) => {
  console.error(redacted(`Spike failed: ${(e as Error).stack ?? e}`));
  process.exit(1);
});
