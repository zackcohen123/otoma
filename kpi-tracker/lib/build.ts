// Assemble the KpiResponse from raw query results. Pure: no I/O, so it is testable end to end.
import type { KpiConfig } from '../config/kpi.config';
import { deriveContacts } from './calc/contacts';
import { calcConversations } from './calc/conversations';
import { calcCoverage } from './calc/coverage';
import { calcHealth } from './calc/health';
import { calcPipeline, calcPipelineDetail, calcQualifiedOpps } from './calc/opportunities';
import { localDate, weekStart } from './dates';
import { buildDefinitions } from './definitions';
import type { KpiResponse, Row } from './types';

export type DataSet = {
  events: Row[];
  calls: Row[];
  opportunities: Row[];
  contactRoles: Row[];
  accounts: Row[];
  contacts: Row[];
  personaValues: Row[];
  campaign: Row[] | null;
};

export type HistoryRow = { weekStart: string; byStatus: Record<string, number>; engagementRate: number; healthScore: number };

export function buildResponse(
  data: DataSet,
  opts: { now: Date; cfg: KpiConfig; source: KpiResponse['source']; history: HistoryRow[]; warnings: string[]; queryCount: number; durationMs: number },
): KpiResponse {
  const { now, cfg } = opts;
  const conv = calcConversations({ events: data.events, calls: data.calls, accounts: data.accounts }, now, cfg);
  const currentWeek = localDate(weekStart(now, cfg), cfg);
  const cv = deriveContacts(data.contacts, data.accounts, cfg);
  const warnings = [...opts.warnings, ...conv.warnings];
  const open = data.opportunities.filter((o) => o.IsClosed === false);
  const noAmount = open.filter((o) => o.Amount == null).length;
  if (noAmount > 0) warnings.push(`${noAmount} of ${open.length} open opportunities have no Amount, so pipeline values read low.`);

  let campaign: KpiResponse['headline']['campaign'] = null;
  if (cfg.campaign.nameLike && data.campaign) {
    const contacts = new Set(conv.all.map((i) => i.contactId).filter(Boolean));
    campaign = {
      name: cfg.campaign.nameLike,
      members: data.campaign.length,
      becameMeeting: data.campaign.filter((m) => m.ContactId && contacts.has(m.ContactId)).length,
      targetMin: cfg.campaign.targetMin,
      targetMax: cfg.campaign.targetMax,
    };
  }

  return {
    generatedAt: now.toISOString(),
    source: opts.source,
    cacheAgeSeconds: 0,
    stale: false,
    warnings,
    headline: {
      conversations: conv.conversations,
      qualifiedOpps: calcQualifiedOpps(data.opportunities, now, cfg),
      pipeline: calcPipeline(data.opportunities, now, cfg),
      campaign,
    },
    coverage: calcCoverage(
      { accounts: data.accounts, priorityContacts: cv.priorityContacts, personaValues: data.personaValues },
      cfg,
      opts.history,
      currentWeek,
    ),
    pipelineDetail: calcPipelineDetail(data.opportunities, cfg),
    crmHealth: calcHealth(
      {
        ...cv,
        accounts: data.accounts,
        opportunities: data.opportunities,
        contactRoles: data.contactRoles,
      },
      now,
      cfg,
    ),
    calibration: conv.calibration,
    definitions: buildDefinitions(cfg),
    meta: { queryCount: opts.queryCount, durationMs: opts.durationMs, configVersion: cfg.version },
  };
}
