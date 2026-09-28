// Calendar boundaries in the configured timezone (Europe/London), returned as UTC instants.
import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, addQuarters, addWeeks, format, startOfMonth, startOfQuarter, startOfWeek } from 'date-fns';

export type Cal = { timezone: string; weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 };

const utc = (d: Date) => new Date(d.getTime());
const tz = (d: Date, cal: Cal) => new TZDate(d, cal.timezone);

export const weekStart = (d: Date, cal: Cal) => utc(startOfWeek(tz(d, cal), { weekStartsOn: cal.weekStartsOn }));
export const monthStart = (d: Date, cal: Cal) => utc(startOfMonth(tz(d, cal)));
export const quarterStart = (d: Date, cal: Cal) => utc(startOfQuarter(tz(d, cal)));

export const shiftWeeks = (d: Date, n: number, cal: Cal) => utc(addWeeks(tz(d, cal), n));
export const shiftMonths = (d: Date, n: number, cal: Cal) => utc(addMonths(tz(d, cal), n));
export const shiftQuarters = (d: Date, n: number, cal: Cal) => utc(addQuarters(tz(d, cal), n));
export const shiftDays = (d: Date, n: number, cal: Cal) => utc(addDays(tz(d, cal), n));

/** Local calendar date (YYYY-MM-DD) of an instant. */
export const localDate = (d: Date, cal: Cal) => format(tz(d, cal), 'yyyy-MM-dd');
/** Local month key (YYYY-MM). */
export const localMonth = (d: Date, cal: Cal) => format(tz(d, cal), 'yyyy-MM');
export const quarterLabel = (d: Date, cal: Cal) => format(tz(d, cal), "QQQ yyyy");

/** Instant of local midnight for a YYYY-MM-DD date (e.g. Task.ActivityDate). */
export function dateToInstant(date: string, cal: Cal): Date {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return utc(new TZDate(y, m - 1, d, cal.timezone));
}

/** Parse Salesforce datetimes, which use "+0000" rather than "Z". */
export function parseSf(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** SOQL datetime literal: 2026-09-21T23:00:00Z (no quotes, no milliseconds). */
export const soqlDateTime = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
