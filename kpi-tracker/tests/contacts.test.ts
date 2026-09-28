import { describe, expect, it } from 'vitest';
import { deriveContacts } from '../lib/calc/contacts';
import { cfg } from './helpers';

const accounts = [
  { Id: 'A1', Name: 'Barclays', TAM_Segment__c: 'Priority TAM', Relationship_Status__c: 'Not Engaged' },
  { Id: 'A2', Name: 'HSBC', TAM_Segment__c: 'Wider TAM', Relationship_Status__c: 'Engaged' },
];
const contacts = [
  { Id: 'C1', Name: 'Warm', AccountId: 'A1', Email: 'x@barclays.example', Warm_Introduction_Available__c: true, Introducer_Referred_By__c: 'Peter' },
  { Id: 'C2', Name: 'Warm but engaged', AccountId: 'A2', Email: 'X@Barclays.example', Warm_Introduction_Available__c: true },
  { Id: 'C3', Name: 'Active, no action', AccountId: 'A2', Email: null, Active_Deal_Contact__c: true, Next_Action_Current_Action__c: '  ' },
  { Id: 'C4', Name: 'Active with action', AccountId: 'A1', Email: 'y@barclays.example', Active_Deal_Contact__c: true, Next_Action_Current_Action__c: 'Call Tues' },
  { Id: 'C5', Name: 'No account', AccountId: null, Email: 'z@example.com' },
];

describe('contacts derived in code', () => {
  const v = deriveContacts(contacts, accounts, cfg());

  it('finds contacts at priority accounts and attaches the account', () => {
    expect(v.priorityContacts.map((c) => c.Id)).toEqual(['C1', 'C4']);
    expect(v.priorityContacts[0].Account.Name).toBe('Barclays');
  });

  it('lists warm intros only at accounts still not engaged', () => {
    expect(v.warmIntros.map((c) => c.Id)).toEqual(['C1']);
  });

  it('lists active deal contacts with a blank next action', () => {
    expect(v.activeNoNextAction.map((c) => c.Id)).toEqual(['C3']);
  });

  it('matches duplicate emails case-insensitively, like Salesforce', () => {
    expect(v.duplicateEmails).toEqual([{ Email: 'x@barclays.example', c: 2 }]);
    expect(v.duplicateContacts.map((c) => c.Id)).toEqual(['C1', 'C2']);
    expect(v.emailTotal).toBe(4);
  });
});
