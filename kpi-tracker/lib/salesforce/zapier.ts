// SalesforceClient over the Zapier MCP server. Read-only by construction: every query passes
// assertSelectOnly and every tool name passes assertReadOnlyTool before it is called.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { assertReadOnlyTool, assertSelectOnly } from '../soql-guard';
import type { Row } from '../types';
import { SoqlError, type SalesforceClient } from './client';
import { fetchAll, summarise } from './paging';

type Caller = (name: string, args: Record<string, unknown>) => Promise<any>;
type Runner = (query: string) => Promise<Row[]>;

export type ZapierOptions = { url: string; token?: string; rowCap: number; concurrency: number; retries: number };

// Errors that retrying cannot fix: bad SOQL, or the Zapier plan's task allowance used up.
const PERMANENT = /(error at row|invalid field|malformed|invalid_type|no such column|unexpected token|not supported|invalid_field|didn't understand|task limit|billing)/i;
const TASK_LIMIT = /task limit/i;

/** Parse a Zapier tool result into rows, or throw a SoqlError. */
export function parseZapierResult(res: any, query: string): Row[] {
  const text = (res?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* plain text */ }
  const err = res?.isError ? (body && typeof body === 'object' && body.error ? String(body.error) : text)
    : body && typeof body === 'object' && body.isError ? String(body.error ?? text) : null;
  if (err && TASK_LIMIT.test(err)) {
    throw new SoqlError('Zapier task limit reached for this billing period, so Salesforce cannot be queried until it resets or the plan is raised.', query, false);
  }
  if (err) throw new SoqlError(err.replace(/^Error during execution:\s*/i, '').trim(), query, !PERMANENT.test(err));
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  if (typeof body === 'string' && /error|failed|denied/i.test(body)) throw new SoqlError(body, query, !PERMANENT.test(body));
  return [];
}

// The resolved meta-tool action, kept for the life of the process so each refresh does not
// spend extra calls looking it up again.
let metaPlan: { selected_api: string; key: string; tool_name: string } | null = null;
export const clearPlanCache = () => (metaPlan = null);

/** Work out how to run SOQL on this server: a direct SOQL tool, or the meta tools. */
export async function resolveRunner(call: Caller, tools: { name: string; inputSchema?: any }[]): Promise<Runner> {
  const direct = tools.find((t) => /soql/i.test(t.name) && !/sosl/i.test(t.name));
  if (direct) {
    assertReadOnlyTool(direct.name);
    const props = direct.inputSchema?.properties ?? {};
    const key = ['soql_query', 'query', 'soql'].find((k) => k in props) ?? Object.keys(props).find((k) => /query|soql/i.test(k));
    if (!key) throw new Error(`SOQL tool ${direct.name} has no query field`);
    return async (q) => {
      const args: Record<string, unknown> = { [key]: q };
      if ('query_type' in props) args.query_type = 'custom';
      if ('instructions' in props) args.instructions = `Run exactly this SOQL SELECT query and return the raw rows: ${q}`;
      return parseZapierResult(await call(direct.name, args), q);
    };
  }
  const inspect = tools.find((t) => t.name === 'inspect_zapier_actions');
  const exec = tools.find((t) => t.name === 'execute_zapier_read_action');
  if (!inspect || !exec) throw new Error('No SOQL tool on this Zapier MCP server. Enable Salesforce "Custom SOQL Query".');
  assertReadOnlyTool(inspect.name);
  assertReadOnlyTool(exec.name);
  if (!metaPlan) {
    const listing = JSON.parse((await call(inspect.name, {})).content[0].text);
    const app = (listing.apps ?? []).find((a: any) => /salesforce/i.test(a.app));
    if (!app) throw new Error('Salesforce is not enabled on this Zapier MCP server');
    const detail = JSON.parse((await call(inspect.name, { selected_api: app.selected_api, action: 'custom_soql_query' })).content[0].text);
    const action = detail?.[0]?.actions?.find((a: any) => a.key === 'custom_soql_query');
    if (!action || action.action_type !== 'search') throw new Error('Salesforce "Custom SOQL Query" read action is not enabled in Zapier');
    metaPlan = { selected_api: app.selected_api, key: action.key, tool_name: action.tool_name };
  }
  const plan = metaPlan;
  return async (q) =>
    parseZapierResult(
      await call(exec.name, {
        selected_api: plan.selected_api,
        action: plan.key,
        tool_name: plan.tool_name,
        params: { query_type: 'custom', dynamic_properties: { soql_query: q } },
      }),
      q,
    );
}

function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try { return await fn(); } finally { active--; queue.shift()?.(); }
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ZapierMcpClient implements SalesforceClient {
  readonly source = 'zapier-mcp' as const;
  private client: Client | null = null;
  private runner: Promise<Runner> | null = null;
  private warnings: string[] = [];
  private calls = 0;
  private ms = 0;
  private limit: ReturnType<typeof limiter>;
  readonly log: { query: string; ms: number; rows: number; ok: boolean }[] = [];

  constructor(private opts: ZapierOptions) {
    this.limit = limiter(opts.concurrency);
  }

  private redact(msg: string) {
    return msg.split(this.opts.url).join('<ZAPIER_MCP_URL>');
  }

  private getRunner(): Promise<Runner> {
    if (!this.runner) {
      this.runner = (async () => {
        const client = new Client({ name: 'otoma-gtm-kpis', version: '1.0.0' });
        const headers: Record<string, string> = this.opts.token ? { Authorization: `Bearer ${this.opts.token}` } : {};
        await client.connect(new StreamableHTTPClientTransport(new URL(this.opts.url), { requestInit: { headers } }));
        this.client = client;
        const { tools } = await client.listTools();
        const call: Caller = (name, args) =>
          client.callTool({ name: assertReadOnlyTool(name), arguments: args }, undefined, { timeout: 90_000 });
        return resolveRunner(call, tools);
      })().catch((e) => {
        this.runner = null;
        throw new Error(this.redact(`Could not connect to Zapier MCP: ${(e as Error).message}`));
      });
    }
    return this.runner;
  }

  private async page(q: string): Promise<Row[]> {
    const run = await this.getRunner();
    for (let attempt = 0; ; attempt++) {
      const t0 = Date.now();
      try {
        const rows = await this.limit(() => run(assertSelectOnly(q)));
        this.record(q, t0, rows.length, true);
        return rows;
      } catch (e) {
        this.record(q, t0, 0, false);
        const transient = e instanceof SoqlError ? e.transient : true;
        if (!transient || attempt >= this.opts.retries) {
          throw e instanceof SoqlError ? e : new SoqlError(this.redact((e as Error).message), q, true);
        }
        await sleep(1000 * 2 ** attempt);
      }
    }
  }

  private record(q: string, t0: number, rows: number, ok: boolean) {
    const ms = Date.now() - t0;
    this.calls++;
    this.ms += ms;
    this.log.push({ query: summarise(q), ms, rows, ok });
  }

  soql(query: string): Promise<Row[]> {
    return fetchAll(assertSelectOnly(query), (q) => this.page(q), this.opts.rowCap, (w) => this.warnings.push(w));
  }

  drainWarnings() {
    const w = this.warnings;
    this.warnings = [];
    return w;
  }

  stats() {
    return { calls: this.calls, ms: this.ms };
  }

  async close() {
    await this.client?.close().catch(() => {});
    this.client = null;
    this.runner = null;
  }
}
