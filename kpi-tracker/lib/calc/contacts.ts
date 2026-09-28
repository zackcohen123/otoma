// Contact-derived lists. All contacts come back in one paged pull (about 2 Zapier calls),
// and everything below is worked out in code. That is cheaper than six filtered queries,
// and avoids Contact queries filtered on Account fields, which time out through Zapier.
import type { KpiConfig } from '../../config/kpi.config';
import type { Row } from '../types';
import { blank } from './util';

export type ContactViews = {
  priorityContacts: Row[];
  warmIntros: Row[];
  activeNoNextAction: Row[];
  duplicateEmails: Row[]; // { Email, c } like the SOQL aggregate
  duplicateContacts: Row[];
  emailTotal: number;
};

export function deriveContacts(contacts: Row[], accounts: Row[], cfg: KpiConfig): ContactViews {
  const byId = new Map(accounts.map((a) => [a.Id as string, a]));
  // Attach the account so the calculators can read Account.Name as they would from SOQL.
  const withAccount: Row[] = contacts.map((c) => {
    const a = c.AccountId ? byId.get(c.AccountId) : undefined;
    return { ...c, Account: a ? { Name: a.Name, TAM_Segment__c: a.TAM_Segment__c, Relationship_Status__c: a.Relationship_Status__c } : null };
  });

  const groups = new Map<string, Row[]>();
  for (const c of withAccount) {
    if (blank(c.Email)) continue;
    const key = String(c.Email).trim().toLowerCase(); // Salesforce compares emails case-insensitively
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);

  return {
    priorityContacts: withAccount.filter((c) => c.Account?.TAM_Segment__c === cfg.coverage.prioritySegment),
    warmIntros: withAccount.filter((c) => c.Warm_Introduction_Available__c === true && c.Account?.Relationship_Status__c === cfg.coverage.notEngagedStatus),
    activeNoNextAction: withAccount.filter((c) => c.Active_Deal_Contact__c === true && blank(c.Next_Action_Current_Action__c)),
    duplicateEmails: dupGroups.map((g) => ({ Email: g[0].Email, c: g.length })),
    duplicateContacts: dupGroups.flat(),
    emailTotal: [...groups.values()].reduce((s, g) => s + g.length, 0),
  };
}
