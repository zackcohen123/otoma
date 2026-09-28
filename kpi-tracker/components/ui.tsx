'use client';

import { useId, useState, type ReactNode } from 'react';
import { toCsv } from '../lib/format';
import type { Rag } from '../lib/types';

export function Section({ id, title, subtitle, children, action }: { id: string; title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-line pb-2">
        <div>
          <h2 id={`${id}-h`} className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ title, children, definition, className = '' }: { title?: string; children: ReactNode; definition?: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-white p-4 ${className}`}>
      {title && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
        </div>
      )}
      {children}
      {definition && <Definition text={definition} />}
    </div>
  );
}

/** "How this is counted" toggle. Always rendered open in print. */
export function Definition({ text, label = 'How this is counted' }: { text: string; label?: string }) {
  return (
    <details className="mt-3 text-xs text-ink-2">
      <summary className="inline-flex items-center gap-1 font-medium text-blue">
        <span className="chev inline-block transition-transform" aria-hidden>›</span> {label}
      </summary>
      <p className="mt-2 max-w-prose leading-relaxed">{text}</p>
    </details>
  );
}

const RAG_META: Record<Rag, { word: string; icon: string; color: string }> = {
  green: { word: 'Green', icon: '✓', color: 'bg-good' },
  amber: { word: 'Amber', icon: '!', color: 'bg-warn' },
  red: { word: 'Red', icon: '✕', color: 'bg-bad' },
};

export function RagBadge({ rag, size = 'sm' }: { rag: Rag; size?: 'sm' | 'lg' }) {
  const m = RAG_META[rag];
  const dot = size === 'lg' ? 'h-6 w-6 text-sm' : 'h-4 w-4 text-[10px]';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`inline-flex ${dot} items-center justify-center rounded-full ${m.color} font-bold text-white`} aria-hidden>{m.icon}</span>
      <span className={size === 'lg' ? 'text-base font-semibold' : 'text-xs font-medium'}>{m.word}</span>
    </span>
  );
}

/** Horizontal progress meter towards a target (or a min to max band). */
export function Meter({ value, target, max, label }: { value: number; target: number; max?: number; label: string }) {
  const scale = Math.max(max ?? target, value, 1) * 1.1;
  const w = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const reached = value >= target;
  return (
    <div role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max ?? target} aria-label={label} className="relative mt-3 h-2 rounded-full bg-subtle">
      <div className={`absolute inset-y-0 left-0 rounded-full ${reached ? 'bg-accent' : 'bg-accent/70'}`} style={{ width: w(value) }} />
      {max != null && <div className="absolute inset-y-[-3px] rounded bg-ink/10" style={{ left: w(target), width: `calc(${w(max)} - ${w(target)})` }} aria-hidden />}
      <div className="absolute inset-y-[-4px] w-0.5 bg-ink" style={{ left: w(target) }} aria-hidden />
    </div>
  );
}

/** Accessible HTML bar list for categorical breakdowns. */
export function BarList({ data, color = 'bg-blue', format = (v: number) => v.toLocaleString('en-GB'), empty = 'No data' }: {
  data: { label: string; value: number; hint?: string }[];
  color?: string;
  format?: (v: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-3 text-sm">
          <span className="truncate text-ink-2" title={d.label}>{d.label}</span>
          <span className="h-3 rounded-r bg-subtle" aria-hidden>
            <span className={`block h-3 rounded-r ${color}`} style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value ? 2 : 0 }} />
          </span>
          <span className="num text-right font-medium" title={d.hint}>{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CsvButton({ rows, columns, filename }: { rows: Record<string, unknown>[]; columns: string[]; filename: string }) {
  return (
    <button type="button" className="no-print rounded border border-line px-2.5 py-1 text-xs font-medium hover:bg-subtle" onClick={() => download(filename, toCsv(rows, columns), 'text/csv')}>
      Export CSV
    </button>
  );
}

export function Table({ head, children, caption, empty }: { head: string[]; children: ReactNode; caption?: string; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h) => <th key={h} scope="col" className="py-2 pr-4 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line/70 [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top">
          {empty ? <tr><td colSpan={head.length} className="text-muted">Nothing to show.</td></tr> : children}
        </tbody>
      </table>
    </div>
  );
}

/** Collapsible list showing the first few items with a "Show all" toggle. */
export function ShowMore<T>({ items, render, initial = 8 }: { items: T[]; render: (t: T, i: number) => ReactNode; initial?: number }) {
  const [all, setAll] = useState(false);
  const id = useId();
  const shown = all ? items : items.slice(0, initial);
  return (
    <>
      <ul id={id} className="divide-y divide-line/70">{shown.map(render)}</ul>
      {items.length > initial && (
        <button type="button" aria-controls={id} className="no-print mt-2 text-xs font-medium text-blue" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

export function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}
