// Human-readable rules, generated from config so the wording always matches the maths.
import type { KpiConfig } from '../config/kpi.config';

const list = (xs: string[]) => xs.map((x) => `"${x}"`).join(', ');
const weekday = (n: number) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n];
const money = (cfg: KpiConfig, v: number) => `${cfg.currency}${v.toLocaleString('en-GB')}`;

export function buildDefinitions(cfg: KpiConfig): Record<string, string> {
  const c = cfg.conversations;
  const h = cfg.health;
  const aliases = Object.entries(c.accountAliases).map(([a, n]) => `${a} = ${n}`);
  const d: Record<string, string> = {
    weeks: `Weeks run ${weekday(cfg.weekStartsOn)} to ${weekday((cfg.weekStartsOn + 6) % 7)} in ${cfg.timezone} time. Months and quarters are calendar months and quarters in the same timezone.`,

    conversations: [
      `A genuine conversation is a meeting or call that has already happened with someone outside Otoma. Each Salesforce record counts once. Target: ${cfg.targets.conversationsPerWeek} a week.`,
      `Meetings (Event): finished (end time has passed), not all-day, not an invitee copy, at least ${c.minMeetingMinutes} minutes long, and the subject does not contain ${list(c.excludeSubjectSignals)}.`,
      `It must look like a conversation: Location contains ${list(c.locationSignals)}, or Subject contains ${list(c.subjectSignals)}${c.meetingTypes.length ? `, or Type is ${list(c.meetingTypes)}` : ''} (not case-sensitive).`,
      `It must involve an external party: the Event is linked to a Contact or to an Account other than ${list(c.internalAccountNames)}` +
        (c.matchUnlinkedBySubject
          ? `, or, when it has no link, its subject names a Salesforce account${aliases.length ? ` (aliases: ${aliases.join('; ')})` : ''} or contains ${list(c.externalSubjectSignals)}.`
          : '.'),
      c.includeCalls
        ? `Calls (Task): subtype Call, status Completed, linked to a Contact or Account, and at least ${c.minCallSeconds} seconds long when a duration is recorded (calls with no duration count).`
        : 'Calls are not counted.',
      `"Booked next 7 days" applies the same rule to meetings that start in the next 7 days.`,
    ].join(' '),

    qualifiedOpps: `Opportunities created in the calendar month with at least ${cfg.qualification.qualifiedMinBant} of the 4 BANT elements (Budget, Authority, Need, Timeline) confirmed. Confirmed means the checkbox is ticked, or a picklist value of ${list(cfg.qualification.positivePicklistValues)}. Target: ${cfg.targets.qualifiedOppsPerMonth.min} to ${cfg.targets.qualifiedOppsPerMonth.max} a month.`,

    pipeline: `Sum of Amount for opportunities created in the current calendar quarter, open or won (closed lost excluded; a blank Amount counts as zero). ` +
      (cfg.targets.bookingsTarget == null
        ? `Target is ${cfg.targets.pipelineMultiple} times the bookings target, which is not set yet.`
        : `Target: ${cfg.targets.pipelineMultiple} times the bookings target of ${money(cfg, cfg.targets.bookingsTarget)} = ${money(cfg, cfg.targets.bookingsTarget * cfg.targets.pipelineMultiple)}.`),

    openPipeline: 'Open opportunities (not closed) grouped by stage, with count and total Amount. Weighted value is Amount times Probability, shown only when Probability is filled in.',

    coverage: `Priority accounts are Accounts with TAM segment "${cfg.coverage.prioritySegment}". Contacts are counted by their Account.`,
    engagementRate: `Share of priority accounts whose relationship status is set and is not "${cfg.coverage.notEngagedStatus}". A snapshot is stored once a week to build the trend.`,
    personaGaps: 'For each Contact persona picklist value, the number of priority accounts with no contact of that persona.',
    contactBuckets: 'Priority accounts grouped by how many contacts they have: 0, 1 to 2, 3 to 4, 5 or more.',

    healthScore: `Weighted average of the metric pass rates below, from 0 to 100. Green at ${h.greenAt} and above, amber at ${h.amberAt} to ${h.greenAt - 1}, red below ${h.amberAt}. Metrics with nothing to measure are left out.`,
    priorityWithContact: `Share of priority accounts with at least 1 contact. Weight ${h.weights.priorityWithContact}.`,
    priorityWithMinContacts: `Share of priority accounts with at least ${h.minContactsPerAccount} contacts. Weight ${h.weights.priorityWithMinContacts}.`,
    contactCompleteness: `Share of contacts at priority accounts with persona, seniority, LinkedIn URL, email and title all filled in. Weight ${h.weights.contactCompleteness}.`,
    bantCompleteness: `Share of open opportunities with all 4 BANT elements confirmed. Weight ${h.weights.bantCompleteness}.`,
    multiThreading: `Share of open opportunities with at least ${h.minContactsPerOpp} contact roles. Weight ${h.weights.multiThreading}.`,
    oppHygiene: `Share of open opportunities with a next step, an Amount, and a close date of today or later. Weight ${h.weights.oppHygiene}.`,
    freshness: `Share of accounts with status ${list(h.freshnessStatuses)} whose last meaningful interaction date is within the last ${h.freshnessDays} days. Weight ${h.weights.freshness}.`,
    duplicateContacts: `Share of contacts with an email address that no other contact shares. Weight ${h.weights.duplicateContacts}.`,

    warmIntros: `Contacts with a warm introduction available at accounts still "${cfg.coverage.notEngagedStatus}".`,
    activeNoNextAction: 'Contacts marked as active deal contacts with no next action recorded.',
    stalledOpps: `Open opportunities with no activity for ${h.staleActivityDays} days or more (or none logged).`,
    overdueOpps: 'Open opportunities with a close date in the past.',
  };
  if (cfg.campaign.nameLike) {
    d.campaign = `Campaign members of campaigns whose name contains "${cfg.campaign.nameLike}". Target ${cfg.campaign.targetMin} to ${cfg.campaign.targetMax}. "Became a meeting" means the member's contact appears in a counted conversation.`;
  }
  return d;
}
