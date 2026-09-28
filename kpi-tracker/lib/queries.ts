// SOQL library. Date boundaries are computed in code (Europe/London) and passed as literals.
// One query often feeds several KPIs, to keep the number of Zapier calls (tasks) low.
import type { KpiConfig } from '../config/kpi.config';
import { localDate, monthStart, quarterStart, shiftDays, shiftMonths, shiftQuarters, shiftWeeks, soqlDateTime, weekStart } from './dates';

export type QueryKey =
  | 'events' | 'calls' | 'opportunities' | 'contactRoles' | 'accounts' | 'contacts' | 'personaValues' | 'campaign';

export type QuerySpec = { key: QueryKey; soql: string; optional?: boolean };

export function windows(now: Date, cfg: KpiConfig) {
  const thisWeek = weekStart(now, cfg);
  const trendFrom = shiftWeeks(thisWeek, -(cfg.conversations.trendWeeks - 1), cfg);
  const thisMonth = monthStart(now, cfg);
  const thisQuarter = quarterStart(now, cfg);
  const oppsFrom = [shiftMonths(thisMonth, -(cfg.qualification.trendMonths - 1), cfg), shiftQuarters(thisQuarter, -1, cfg)]
    .reduce((a, b) => (a < b ? a : b));
  return {
    now,
    thisWeek,
    lastWeek: shiftWeeks(thisWeek, -1, cfg),
    trendFrom,
    eventsTo: shiftDays(now, 8, cfg), // covers "booked next 7 days"
    thisMonth,
    thisQuarter,
    oppsFrom,
  };
}

const q = (s: string) => s.replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function buildQueries(now: Date, cfg: KpiConfig): QuerySpec[] {
  const w = windows(now, cfg);
  const specs: QuerySpec[] = [
    {
      key: 'events',
      // Event.Type is not enabled in this org, so it is not selected.
      soql: q(`SELECT Id, Subject, StartDateTime, EndDateTime, DurationInMinutes, Location, IsAllDayEvent,
        WhoId, Who.Name, Who.Type, AccountId, Account.Name, Account.TAM_Segment__c
        FROM Event
        WHERE StartDateTime >= ${soqlDateTime(w.trendFrom)} AND StartDateTime < ${soqlDateTime(w.eventsTo)}
          AND IsChild = false
        ORDER BY Id`),
    },
    {
      key: 'calls',
      soql: q(`SELECT Id, Subject, TaskSubtype, Status, ActivityDate, CallDurationInSeconds,
        WhoId, Who.Name, Who.Type, AccountId, Account.Name, Account.TAM_Segment__c
        FROM Task
        WHERE TaskSubtype = 'Call' AND Status = 'Completed'
          AND ActivityDate >= ${localDate(w.trendFrom, cfg)} AND ActivityDate <= ${localDate(now, cfg)}
        ORDER BY Id`),
    },
    {
      key: 'opportunities',
      soql: q(`SELECT Id, Name, AccountId, Account.Name, StageName, Amount, Probability, CloseDate, CreatedDate,
        IsClosed, IsWon, LastActivityDate, NextStep,
        Budget_Confirmed__c, Authority_Confirmed__c, Need_Confirmed__c, Timeline_Confirmed__c
        FROM Opportunity
        WHERE IsClosed = false OR CreatedDate >= ${soqlDateTime(w.oppsFrom)}
        ORDER BY Id`),
    },
    {
      key: 'contactRoles',
      soql: q(`SELECT OpportunityId, COUNT(Id) c FROM OpportunityContactRole
        WHERE Opportunity.IsClosed = false GROUP BY OpportunityId`),
    },
    {
      // All accounts: priority coverage, freshness, and the name list for subject matching.
      key: 'accounts',
      soql: q(`SELECT Id, Name, TAM_Segment__c, Region__c, Relationship_Status__c,
        Last_Meaningful_Interaction_Date__c, Current_Payments_Platform_Vendor__c
        FROM Account ORDER BY Id`),
    },
    {
      // All contacts in one paged pull. Priority coverage, completeness, warm intros, next actions
      // and duplicates are derived in code (lib/calc/contacts.ts). That costs fewer Zapier calls
      // than filtered queries, and Contact queries filtered on Account fields time out via Zapier.
      key: 'contacts',
      soql: q(`SELECT Id, Name, AccountId, Email, Title, Contact_Persona__c, Seniority__c, LinkedIn_URL__c,
        Warm_Introduction_Available__c, Introducer_Referred_By__c, Active_Deal_Contact__c, Next_Action_Current_Action__c
        FROM Contact ORDER BY Id`),
    },
    {
      // Persona picklist values, so persona gaps cover every persona, not only those in use.
      key: 'personaValues',
      optional: true,
      soql: q(`SELECT Value, IsActive FROM PicklistValueInfo
        WHERE EntityParticle.EntityDefinition.QualifiedApiName = 'Contact'
          AND EntityParticle.QualifiedApiName = 'Contact_Persona__c'`),
    },
  ];
  if (cfg.campaign.nameLike) {
    specs.push({
      key: 'campaign',
      optional: true,
      soql: q(`SELECT Id, CampaignId, Campaign.Name, ContactId, LeadId FROM CampaignMember
        WHERE Campaign.Name LIKE '%${esc(cfg.campaign.nameLike)}%' ORDER BY Id`),
    });
  }
  return specs;
}
