// Keyset pagination. Zapier caps results at `cap` rows and gives no cursor, so any
// non-aggregate query that may exceed the cap must end in ORDER BY Id; we then fetch
// further pages with Id > lastId. OFFSET is never used (it tops out at 2,000 anyway).
import type { Row } from '../types';
import { isAggregate } from './client';

/** Index of the first top-level occurrence of `word` (ignores subqueries and string literals). */
function topLevelIndex(q: string, word: RegExp): number {
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < q.length; i++) {
    const ch = q[i];
    if (inStr) { if (ch === '\\') i++; else if (ch === "'") inStr = false; continue; }
    if (ch === "'") inStr = true;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && /\s/.test(ch)) {
      const m = q.slice(i).match(word);
      if (m && m.index === 0) return i;
    }
  }
  return -1;
}

const ORDER_BY_ID = /\s+order\s+by\s+id\s*(asc)?\s*$/i;

export function canKeyset(q: string): boolean {
  return !isAggregate(q) && ORDER_BY_ID.test(q.trim()) && !/\blimit\b/i.test(q);
}

/** Rewrite `q` (ending in ORDER BY Id) to fetch rows after `lastId`. */
export function keysetQuery(q: string, lastId: string): string {
  const trimmed = q.trim();
  const body = trimmed.replace(ORDER_BY_ID, '');
  const cond = `Id > '${lastId.replace(/[^A-Za-z0-9]/g, '')}'`;
  const w = topLevelIndex(body, /^\s+where\s+/i);
  if (w === -1) return `${body} WHERE ${cond} ORDER BY Id`;
  const whereMatch = body.slice(w).match(/^\s+where\s+/i)!;
  const head = body.slice(0, w);
  const clause = body.slice(w + whereMatch[0].length);
  return `${head} WHERE ${cond} AND (${clause}) ORDER BY Id`;
}

export async function fetchAll(
  query: string,
  fetchPage: (q: string) => Promise<Row[]>,
  cap: number,
  warn: (msg: string) => void,
  maxPages = 25,
): Promise<Row[]> {
  const first = await fetchPage(query);
  if (first.length < cap) return first;
  if (!canKeyset(query)) {
    warn(`A result hit the ${cap}-row cap and may be truncated: ${summarise(query)}`);
    return first;
  }
  const all = [...first];
  let page = first;
  for (let i = 1; i < maxPages && page.length >= cap; i++) {
    page = await fetchPage(keysetQuery(query, String(page[page.length - 1].Id)));
    all.push(...page);
  }
  if (page.length >= cap) warn(`Stopped paging after ${maxPages} pages; result may be truncated: ${summarise(query)}`);
  return all;
}

export const summarise = (q: string) => q.replace(/\s+/g, ' ').trim().slice(0, 90) + (q.length > 90 ? '…' : '');
