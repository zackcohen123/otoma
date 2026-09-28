// A Salesforce row as returned through Zapier: flat fields plus nested relationship objects.
export type Row = Record<string, any>;

export type Rag = 'green' | 'amber' | 'red';

export type RecordLink = { id: string; name: string; url: string };

export type ConversationItem = {
  id: string;
  kind: 'meeting' | 'call';
  start: string; // ISO
  subject: string;
  person: string | null;
  account: string | null;
  accountId: string | null;
  contactId: string | null;
  matchedBy: 'linked' | 'subject';
  url: string;
};

export type QualifiedOppItem = {
  id: string;
  name: string;
  account: string | null;
  stage: string;
  amount: number | null;
  created: string;
  bantConfirmed: number;
  missing: string[];
  qualified: boolean;
  url: string;
};

export type HealthMetric = {
  key: string;
  label: string;
  passRate: number; // 0 to 100
  threshold: number;
  rag: Rag;
  weight: number;
  passed: number;
  total: number;
  failing: RecordLink[];
};

export type ActionItem = { id: string; name: string; detail: string; url: string };

export type KpiResponse = {
  generatedAt: string;
  source: 'zapier-mcp' | 'mock';
  cacheAgeSeconds: number;
  stale: boolean;
  warnings: string[];
  headline: {
    conversations: {
      thisWeek: number;
      target: number;
      lastWeek: number;
      meetings: number;
      calls: number;
      uniqueAccounts: number;
      uniqueContacts: number;
      bookedNext7Days: number;
      trend: { weekStart: string; count: number; sibos?: boolean; event?: string }[];
      items: ConversationItem[];
      byDay: { date: string; count: number }[];
    };
    qualifiedOpps: {
      thisMonth: number;
      lastMonth: number;
      targetMin: number;
      targetMax: number;
      trend: { month: string; count: number }[];
      items: QualifiedOppItem[];
    };
    pipeline: {
      createdThisQuarter: number;
      createdLastQuarter: number;
      target: number | null;
      multiple: number;
      currency: string;
      quarterLabel: string;
    };
    campaign: null | {
      name: string;
      members: number;
      becameMeeting: number;
      targetMin: number;
      targetMax: number;
    };
  };
  coverage: {
    priorityTotal: number;
    byStatus: Record<string, number>;
    byRegion: Record<string, number>;
    noContacts: { id: string; name: string; region: string; status: string; url: string }[];
    contactBuckets: Record<'0' | '1-2' | '3-4' | '5+', number>;
    personaGaps: Record<string, number>;
    personaValues: string[];
    engagementRate: number;
    engagementTrend: { weekStart: string; rate: number }[];
  };
  pipelineDetail: {
    byStage: { stage: string; count: number; value: number }[];
    openTotal: number;
    openCount: number;
    weighted: number | null;
    bantDistribution: Record<'0' | '1' | '2' | '3' | '4', number>;
  };
  crmHealth: {
    score: number;
    rag: Rag;
    metrics: HealthMetric[];
    actionLists: Record<string, ActionItem[]>;
  };
  calibration: { unclassifiedEvents: { id: string; subject: string; type: string | null; start: string; reason: string; url: string }[] };
  definitions: Record<string, string>;
  meta: { queryCount: number; durationMs: number; configVersion: string; lastError?: string };
};
