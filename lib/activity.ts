import type { Activity } from "@/lib/types";

const DAY = 86_400_000;

export function effectiveDate(a: Activity) {
  return a.activityDate ?? a.createdDate.slice(0, 10);
}

// "Today" in the team's timezone (APP_TIMEZONE, e.g. America/New_York), so
// overdue/today labels don't flip at UTC midnight.
function startOfToday() {
  const tz = process.env.APP_TIMEZONE?.trim() || "UTC";
  return Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()));
}

export function daysFromToday(isoDate: string) {
  return Math.round((Date.parse(isoDate.slice(0, 10)) - startOfToday()) / DAY);
}

export type Density = { count: number; days: number };

// Smallest window that clears its bar wins, so the callout is as specific as possible.
const DENSE_WINDOWS: { days: number; min: number }[] = [
  { days: 7, min: 3 },
  { days: 14, min: 4 },
  { days: 30, min: 6 },
];
export const STALE_AFTER_DAYS = 60;

export function analyzeActivity(activities: Activity[]) {
  const sorted = [...activities].sort((a, b) =>
    effectiveDate(b).localeCompare(effectiveDate(a)) || b.createdDate.localeCompare(a.createdDate),
  );
  const past = sorted.filter((a) => daysFromToday(effectiveDate(a)) <= 0);
  const upcoming = sorted.filter((a) => daysFromToday(effectiveDate(a)) > 0).reverse();

  let density: Density | null = null;
  for (const w of DENSE_WINDOWS) {
    const count = past.filter((a) => -daysFromToday(effectiveDate(a)) < w.days).length;
    if (count >= w.min) {
      density = { count, days: w.days };
      break;
    }
  }

  const lastTouch = past[0] ? effectiveDate(past[0]) : null;
  const daysSinceLastTouch = lastTouch ? -daysFromToday(lastTouch) : null;
  const overdue = sorted.filter((a) => !a.isClosed && daysFromToday(effectiveDate(a)) < 0).length;

  return {
    past,
    upcoming,
    density,
    lastTouch,
    daysSinceLastTouch,
    stale: daysSinceLastTouch === null || daysSinceLastTouch > STALE_AFTER_DAYS,
    overdue,
  };
}

export function isOverdue(a: Activity) {
  return !a.isClosed && daysFromToday(effectiveDate(a)) < 0;
}

export function formatDate(iso: string | null, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC", ...opts });
}

export function relativeDays(iso: string) {
  const n = daysFromToday(iso);
  if (n === 0) return "today";
  if (n === -1) return "yesterday";
  if (n === 1) return "tomorrow";
  return n < 0 ? `${-n}d ago` : `in ${n}d`;
}
