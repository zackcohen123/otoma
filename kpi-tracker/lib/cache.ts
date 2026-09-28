// Result cache: in memory plus JSON files in CACHE_DIR (default .cache/), so restarts are cheap.
// Serves the last good result when a refresh fails, and never returns empty cards on a blip.
import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/kpi.config';
import type { HistoryRow } from './build';
import { localDate, weekStart } from './dates';
import { refresh } from './refresh';
import type { SalesforceClient } from './salesforce/client';
import { mockHistory } from './salesforce/fixtures';
import { MockClient, type MockScenario } from './salesforce/mock';
import { ZapierMcpClient } from './salesforce/zapier';
import type { KpiResponse } from './types';

const dir = () => process.env.CACHE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '.cache');
const RESULT = 'kpis.json';
const HISTORY = 'history.json';

type State = {
  last: KpiResponse | null;
  loaded: boolean;
  lastError: string | null;
  lastManual: number;
  inflight: Promise<KpiResponse> | null;
};
const g = globalThis as unknown as { __kpiState?: State };
const state: State = (g.__kpiState ??= { last: null, loaded: false, lastError: null, lastManual: 0, inflight: null });

export const isMock = () => process.env.MOCK === '1';

function makeClient(now: Date): SalesforceClient {
  if (isMock()) return new MockClient(now, config, (process.env.MOCK_SCENARIO as MockScenario) || 'ok');
  const url = process.env.ZAPIER_MCP_URL;
  if (!url) throw new Error('ZAPIER_MCP_URL is not set. Add it to .env, or run with MOCK=1.');
  return new ZapierMcpClient({ url, token: process.env.ZAPIER_MCP_TOKEN, ...config.zapier });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ dir(), file), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  try {
    await mkdir(dir(), { recursive: true });
    const tmp = path.join(/*turbopackIgnore: true*/ dir(), `${file}.tmp`);
    await writeFile(tmp, JSON.stringify(value));
    await rename(tmp, path.join(/*turbopackIgnore: true*/ dir(), file));
  } catch (e) {
    console.warn(`[kpis] could not write cache file ${file}: ${(e as Error).message}`);
  }
}

async function load() {
  if (state.loaded) return;
  state.loaded = true;
  const cached = await readJson<KpiResponse | null>(RESULT, null);
  // Never serve a mock result as live data, or the other way round.
  if (cached && cached.source === (isMock() ? 'mock' : 'zapier-mcp')) state.last = cached;
}

/** Append one snapshot per week (priority accounts by status, engagement rate, health score). */
async function snapshot(r: KpiResponse, now: Date) {
  const history = await readJson<HistoryRow[]>(HISTORY, []);
  const week = localDate(weekStart(now, config), config);
  if (!history.some((h) => h.weekStart === week)) {
    history.push({ weekStart: week, byStatus: r.coverage.byStatus, engagementRate: r.coverage.engagementRate, healthScore: r.crmHealth.score });
    history.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    await writeJson(HISTORY, history);
  }
}

function doRefresh(): Promise<KpiResponse> {
  state.inflight ??= (async () => {
    const now = new Date();
    const client = makeClient(now);
    try {
      const history = isMock() ? mockHistory(now, config) : await readJson<HistoryRow[]>(HISTORY, []);
      const result = await refresh(client, config, now, history);
      if (!isMock()) await snapshot(result, now);
      state.last = result;
      state.lastError = null;
      await writeJson(RESULT, result);
      console.log(`[kpis] refreshed from ${result.source}: ${result.meta.queryCount} calls in ${result.meta.durationMs} ms`);
      return result;
    } catch (e) {
      state.lastError = (e as Error).message;
      console.warn(`[kpis] refresh failed: ${state.lastError}`);
      throw e;
    } finally {
      await client.close();
      state.inflight = null;
    }
  })();
  return state.inflight;
}

function present(r: KpiResponse): KpiResponse {
  const age = Math.max(0, Math.round((Date.now() - Date.parse(r.generatedAt)) / 1000));
  const stale = age > config.cache.ttlMinutes * 60;
  const warnings = [...r.warnings];
  if (state.lastError) {
    const mins = Math.round(age / 60);
    warnings.unshift(`Refresh failed, showing data from ${mins} minute${mins === 1 ? '' : 's'} ago. Error: ${state.lastError}`);
  }
  return { ...r, cacheAgeSeconds: age, stale, warnings, meta: { ...r.meta, lastError: state.lastError ?? undefined } };
}

export class NoDataError extends Error {}

/** Cached data, refreshed first if older than the TTL. */
export async function getKpis(): Promise<KpiResponse> {
  await load();
  const fresh = state.last && Date.now() - Date.parse(state.last.generatedAt) < config.cache.ttlMinutes * 60_000;
  if (!fresh) {
    try {
      await doRefresh();
    } catch (e) {
      if (!state.last) throw new NoDataError((e as Error).message);
    }
  }
  return present(state.last!);
}

/** Forced refresh, limited to once per cooldown window. */
export async function forceRefresh(): Promise<{ limited: boolean; retryAfterSeconds: number; data: KpiResponse | null; error?: string }> {
  await load();
  const cooldown = config.cache.manualRefreshCooldownMinutes * 60_000;
  const wait = state.lastManual + cooldown - Date.now();
  if (wait > 0) return { limited: true, retryAfterSeconds: Math.ceil(wait / 1000), data: state.last ? present(state.last) : null };
  state.lastManual = Date.now();
  try {
    await doRefresh();
  } catch (e) {
    return { limited: false, retryAfterSeconds: 0, data: state.last ? present(state.last) : null, error: (e as Error).message };
  }
  return { limited: false, retryAfterSeconds: 0, data: present(state.last!) };
}
