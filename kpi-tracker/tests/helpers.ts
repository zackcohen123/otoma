import { config, type KpiConfig } from '../config/kpi.config';

export const cfg = (over: (c: KpiConfig) => void = () => {}): KpiConfig => {
  const c = structuredClone(config);
  over(c);
  return c;
};

/** Event row with sensible defaults (a finished 30-minute Teams meeting with a contact). */
export const event = (over: Record<string, any> = {}) => ({
  Id: over.Id ?? `00U${Math.random().toString(36).slice(2, 12)}`,
  Subject: 'Zack <> Priya Connect',
  StartDateTime: '2026-09-22T09:00:00.000+0000',
  EndDateTime: '2026-09-22T09:30:00.000+0000',
  DurationInMinutes: 30,
  Location: 'Microsoft Teams Meeting',
  IsAllDayEvent: false,
  IsChild: false,
  WhoId: '003AAA',
  Who: { Name: 'Priya Patel', Type: 'Contact' },
  AccountId: '001BARC',
  Account: { Name: 'Barclays', TAM_Segment__c: 'Priority TAM' },
  ...over,
});

export const call = (over: Record<string, any> = {}) => ({
  Id: over.Id ?? `00T${Math.random().toString(36).slice(2, 12)}`,
  Subject: 'Call',
  TaskSubtype: 'Call',
  Status: 'Completed',
  ActivityDate: '2026-09-23',
  CallDurationInSeconds: 300,
  WhoId: '003BBB',
  Who: { Name: 'Tom Walsh', Type: 'Contact' },
  AccountId: '001HSBC',
  Account: { Name: 'HSBC' },
  ...over,
});

export const accounts = [
  { Id: '001BARC', Name: 'Barclays', TAM_Segment__c: 'Priority TAM' },
  { Id: '001HSBC', Name: 'HSBC', TAM_Segment__c: 'Wider TAM' },
  { Id: '001NBG', Name: 'National Bank of Greece', TAM_Segment__c: 'Priority TAM' },
  { Id: '001DB', Name: 'Deutsche Bank AG', TAM_Segment__c: 'Priority TAM' },
  { Id: '001OTO', Name: 'Otoma', TAM_Segment__c: 'Partner / Analyst / Other' },
];

// Monday 28 September 2026, 14:00 London (BST, UTC+1).
export const NOW = new Date('2026-09-28T13:00:00Z');
