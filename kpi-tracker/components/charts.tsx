'use client';

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { monthLabel, weekLabel } from '../lib/format';
import { SrTable } from './ui';

const ACCENT = '#b3005e';
const BLUE = '#2a78d6';
const INK = '#1a1a19';
const MUTED = '#6b6b67';
const GRID = '#ececea';
const axis = { fontSize: 11, fill: MUTED };

function Tip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-line bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <div className="font-medium text-ink">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="num text-ink-2">
          <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: p.color ?? p.fill }} aria-hidden />
          {fmt ? fmt(p.value, p.payload) : p.value}
        </div>
      ))}
    </div>
  );
}

export function WeeklyConversations({ data, target }: { data: { weekStart: string; count: number; sibos?: boolean; event?: string }[]; target: number }) {
  const rows = data.map((d) => ({ ...d, label: weekLabel(d.weekStart) }));
  const max = Math.max(target, ...rows.map((r) => r.count)) + 2;
  const eventWeek = rows.find((r) => r.event);
  return (
    <figure>
      <div role="img" aria-label={`Conversations per week for the last ${rows.length} weeks against a target of ${target}. This week: ${rows.at(-1)?.count ?? 0}.`} className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 8, bottom: 0, left: -18 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, max]} />
            {eventWeek && <ReferenceArea x1={eventWeek.label} x2={eventWeek.label} fill={INK} fillOpacity={0.05} label={{ value: eventWeek.event, position: 'insideTop', fontSize: 11, fill: INK }} />}
            <ReferenceLine y={target} stroke={INK} strokeDasharray="4 4" label={{ value: `Target ${target}`, position: 'insideTopLeft', fontSize: 11, fill: INK }} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<Tip fmt={(v: number, p: any) => `${v} conversation${v === 1 ? '' : 's'}${p.event ? `, ${p.event} week` : ''}`} />} />
            <Bar dataKey="count" maxBarSize={24} radius={[4, 4, 0, 0]}>
              {rows.map((r, i) => <Cell key={r.weekStart} fill={ACCENT} fillOpacity={i === rows.length - 1 ? 1 : 0.55} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption="Conversations per week" head={['Week starting', 'Conversations', 'Event']} rows={rows.map((r) => [r.weekStart, r.count, r.event ?? ''])} />
    </figure>
  );
}

export function MonthlyQualified({ data, min, max }: { data: { month: string; count: number }[]; min: number; max: number }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));
  return (
    <figure>
      <div role="img" aria-label={`Qualified opportunities per month for ${rows.length} months against a target of ${min} to ${max}.`} className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, Math.max(max + 1, ...rows.map((r) => r.count))]} />
            <ReferenceArea y1={min} y2={max} fill={BLUE} fillOpacity={0.08} label={{ value: `Target ${min} to ${max}`, position: 'insideTopLeft', fontSize: 11, fill: INK }} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<Tip fmt={(v: number) => `${v} qualified`} />} />
            <Bar dataKey="count" fill={ACCENT} maxBarSize={24} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption="Qualified opportunities per month" head={['Month', 'Qualified']} rows={rows.map((r) => [r.month, r.count])} />
    </figure>
  );
}

export function EngagementTrend({ data }: { data: { weekStart: string; rate: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: weekLabel(d.weekStart) }));
  if (rows.length < 2) {
    return <p className="text-sm text-muted">The trend builds up as one snapshot is stored each week. {rows.length === 1 ? 'The first one is stored.' : ''}</p>;
  }
  return (
    <figure>
      <div role="img" aria-label={`Engagement rate by week, latest ${rows.at(-1)?.rate}%.`} className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} unit="%" domain={[0, (dataMax: number) => Math.max(10, Math.ceil(dataMax / 10) * 10)]} />
            <Tooltip content={<Tip fmt={(v: number) => `${v}% engaged`} />} />
            <Line type="linear" dataKey="rate" stroke={BLUE} strokeWidth={2} dot={{ r: 4, fill: BLUE, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption="Engagement rate by week" head={['Week starting', 'Engagement rate']} rows={rows.map((r) => [r.weekStart, `${r.rate}%`])} />
    </figure>
  );
}

export function StageBars({ data, fmt }: { data: { stage: string; count: number; value: number }[]; fmt: (v: number) => string }) {
  if (data.length === 0) return <p className="text-sm text-muted">No open opportunities.</p>;
  return (
    <figure>
      <div role="img" aria-label="Open pipeline value by stage" style={{ height: Math.max(120, data.length * 36 + 24) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 8 }} barCategoryGap="25%">
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={fmt} />
            <YAxis type="category" dataKey="stage" tick={{ ...axis, fill: INK }} tickLine={false} axisLine={false} width={170} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<Tip fmt={(v: number, p: any) => `${fmt(v)} across ${p.count} opportunit${p.count === 1 ? 'y' : 'ies'}`} />} />
            <Bar dataKey="value" fill={BLUE} maxBarSize={20} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: INK, formatter: (v: any) => fmt(Number(v)) }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption="Open pipeline by stage" head={['Stage', 'Opportunities', 'Value']} rows={data.map((d) => [d.stage, d.count, fmt(d.value)])} />
    </figure>
  );
}
