import type { Rag, Row } from '../types';

/** Read a dotted path such as "Account.Name" from a row. */
export function get(row: Row | null | undefined, path: string): any {
  return path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), row);
}

export const recordUrl = (base: string, id: string) => `${base.replace(/\/$/, '')}/${id}`;

export const isContactId = (id: unknown) => typeof id === 'string' && id.startsWith('003');

export const pct = (passed: number, total: number) => (total === 0 ? 100 : Math.round((passed / total) * 1000) / 10);

export function ragFor(value: number, greenAt: number, amberAt: number): Rag {
  return value >= greenAt ? 'green' : value >= amberAt ? 'amber' : 'red';
}

export const containsAny = (text: string | null | undefined, needles: string[]) => {
  const t = (text ?? '').toLowerCase();
  return needles.some((n) => n && t.includes(n.toLowerCase()));
};

export const blank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');

export function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

export const num = (v: unknown) => (typeof v === 'number' ? v : v == null || v === '' ? null : Number(v));
