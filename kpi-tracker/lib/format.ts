// Display formatting (British English). Pure, shared by the UI and the scorecard export.

export function money(v: number, currency = '£', compact = true): string {
  if (!compact || Math.abs(v) < 10_000) return `${currency}${Math.round(v).toLocaleString('en-GB')}`;
  if (Math.abs(v) >= 1_000_000) return `${currency}${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`;
  return `${currency}${Math.round(v / 1000).toLocaleString('en-GB')}k`;
}

export const pctText = (v: number) => `${Math.round(v)}%`;

export function relTime(seconds: number): string {
  if (seconds < 60) return 'just now';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} days ago`;
}

const TZ = 'Europe/London';
export const dayLabel = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
export const dateLong = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
export const weekLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export function delta(current: number, previous: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  const d = current - previous;
  if (d === 0) return { text: 'Same as last', dir: 'flat' };
  return { text: `${d > 0 ? '+' : ''}${d.toLocaleString('en-GB')} vs last`, dir: d > 0 ? 'up' : 'down' };
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n');
}

/** Salesforce labels can contain em dashes ("Engaged \u2014 Dormant"); show them with a comma. Display only. */
export const displayLabel = (label: string) => label.replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/, ([A-Z])([a-z])/g, (_, a, b) => `, ${a.toLowerCase()}${b}`);
