// Single source of definitions and targets. The "Definitions" panel text is generated from
// this file (lib/definitions.ts), so wording and maths cannot drift apart.
// Bump `version` whenever you change a rule; it is shown in the dashboard footer.

export const config = {
  version: '2026-09-28.1',
  timezone: 'Europe/London',
  weekStartsOn: 1 as 0 | 1 | 2 | 3 | 4 | 5 | 6, // 1 = Monday
  currency: '£',
  salesforceBaseUrl: 'https://energy-flow-1774.lightning.force.com',

  targets: {
    conversationsPerWeek: 15,
    qualifiedOppsPerMonth: { min: 4, max: 6 },
    pipelineMultiple: 3,
    bookingsTarget: null as number | null, // TBC with Peter, 31 Dec
  },

  conversations: {
    trendWeeks: 8,
    minMeetingMinutes: 10,
    minCallSeconds: 60,
    // A meeting "looks like a conversation" if Location or Subject matches one of these
    // (case-insensitive substring match).
    // "stand" and "booth" catch in-person Sibos meetings (for example "Meet at the bank stand").
    locationSignals: ['microsoft teams', 'teams', 'zoom.us', 'meet.google.com', 'stand', 'booth'],
    subjectSignals: ['teams', 'call', 'catch up', 'catchup', 'intro', 'discovery', 'connect', '<>', 'meeting', '[external]'],
    // Event.Type is not enabled in this org (Phase 0), so this stays empty.
    meetingTypes: [] as string[],
    // Rule (b): an Event with no Contact or Account link still counts when it looks like a
    // meeting AND its subject names a known account (or an alias below) or carries an
    // external marker.
    matchUnlinkedBySubject: true,
    externalSubjectSignals: ['[external]'],
    // Subject words that always exclude an Event (cancelled or declined invites).
    excludeSubjectSignals: ['canceled', 'cancelled', 'declined'],
    // Short names used in meeting subjects, mapped to the Salesforce Account name.
    accountAliases: { NBG: 'National Bank of Greece' } as Record<string, string>,
    // Account names never matched from a subject (too generic, or not an external party).
    ignoreAccountNames: [] as string[],
    internalAccountNames: ['Otoma'],
    // Calls are kept in the KPI. None are logged yet (Phase 0), so a warning is shown while
    // the count is zero. Set to false to hide calls entirely.
    includeCalls: true,
  },

  qualification: {
    qualifiedMinBant: 4, // Peter's threshold still to be agreed
    // BANT fields are checkboxes in this org. Picklist values in this list also count.
    positivePicklistValues: ['yes', 'confirmed', 'true'],
    trendMonths: 6,
  },

  coverage: {
    prioritySegment: 'Priority TAM',
    notEngagedStatus: 'Not Engaged',
  },

  health: {
    minContactsPerAccount: 3,
    minContactsPerOpp: 5, // Peter's five-person rule
    staleActivityDays: 14,
    freshnessDays: 30,
    freshnessStatuses: ['Engaged', 'Active Opportunity'],
    greenAt: 80,
    amberAt: 60,
    weights: {
      priorityWithContact: 20,
      priorityWithMinContacts: 15,
      contactCompleteness: 15,
      bantCompleteness: 15,
      multiThreading: 10,
      oppHygiene: 10,
      freshness: 10,
      duplicateContacts: 5,
    },
  },

  events: [{ name: 'Sibos Miami', start: '2026-09-28', end: '2026-10-01' }],

  campaign: { nameLike: null as string | null, targetMin: 10, targetMax: 20 },

  cache: { ttlMinutes: 30, manualRefreshCooldownMinutes: 5 },

  zapier: {
    rowCap: 2000, // Zapier returns at most this many rows per call, silently (Phase 0)
    concurrency: 4,
    retries: 2,
  },
};

export type KpiConfig = typeof config;
