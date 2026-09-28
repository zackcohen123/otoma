// Realistic fixture data for MOCK=1, generated relative to "now" with a fixed seed.
import type { KpiConfig } from '../../config/kpi.config';
import { localDate, shiftDays, shiftMonths, shiftWeeks, weekStart } from '../dates';
import type { Row } from '../types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BANKS = [
  'Barclays', 'HSBC', 'Lloyds Banking Group', 'NatWest Group', 'Santander UK', 'Standard Chartered', 'Nationwide Building Society',
  'Bank of Ireland', 'AIB', 'Deutsche Bank AG', 'Commerzbank', 'BNP Paribas', 'Societe Generale', 'ING', 'ABN Amro', 'Rabobank',
  'KBC', 'Nordea', 'Danske Bank', 'SEB', 'DNB', 'UniCredit', 'Intesa Sanpaolo', 'BBVA', 'CaixaBank', 'National Bank of Greece',
  'Alpha Bank', 'Erste Group', 'Raiffeisen Bank International', 'UBS', 'Julius Baer', 'DBS', 'OCBC', 'UOB', 'Maybank', 'ANZ',
  'Westpac', 'Bank of New Zealand', 'MUFG', 'Mizuho', 'SMBC', 'ICICI Bank', 'HDFC Bank', 'Emirates NBD', 'First Abu Dhabi Bank',
  'QNB', 'Standard Bank', 'Absa Group', 'Nedbank', 'RBC', 'TD Bank', 'BMO', 'Scotiabank', 'CIBC', 'Citizens Bank', 'KeyBank',
];
const REGION: Record<string, string> = {};
BANKS.forEach((b, i) => (REGION[b] = ['UK and Ireland', 'Europe', 'Europe', 'APAC', 'Americas', 'MEA'][i < 9 ? 0 : i < 31 ? 1 : i < 44 ? 3 : i < 49 ? 5 : 4]));
const STATUSES = ['Not Engaged', 'Not Engaged', 'Not Engaged', 'Engaged', 'Active Opportunity', 'Engaged — Dormant', 'Customer', null];
const PERSONAS = ['Payments Leadership', 'Transformation', 'Technology/Architecture', 'Operations', 'Treasury/Cash Management', 'Risk/Resilience', 'General Banking (Non-Payments)', 'Other'];
const FIRST = ['Amelia', 'Oliver', 'Priya', 'James', 'Sofia', 'Liam', 'Hannah', 'Mateo', 'Chloe', 'Kenji', 'Aisha', 'Tom', 'Ingrid', 'Rahul', 'Grace', 'Lukas'];
const LAST = ['Patel', 'Smith', 'Jones', 'Müller', 'Rossi', 'Tanaka', 'Khan', 'Brown', 'Dubois', 'Silva', 'Andersen', 'Walsh', 'Cohen', 'Nguyen'];
const STAGES = ['1. Targeting', '2. Interest', '3. Opportunity - BANT confirmed', '4. Solution', '5. Proposal', '6. Negotiation'];

export type Fixtures = Record<
  'events' | 'calls' | 'opportunities' | 'contactRoles' | 'accounts' | 'contacts' | 'personaValues' | 'campaign',
  Row[]
>;

export function makeFixtures(now: Date, cfg: KpiConfig): Fixtures {
  const r = rng(20260928);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const counters: Record<string, number> = {};
  const id = (prefix: string) => `${prefix}MOCK${String((counters[prefix] = (counters[prefix] ?? 0) + 1)).padStart(8, '0')}AAA`;
  const iso = (d: Date) => d.toISOString().replace('Z', '+0000');

  // Accounts: priority banks, some wider TAM, partners, and Otoma itself.
  const accounts: Row[] = BANKS.map((name, i) => ({
    Id: id('001'),
    Name: name,
    TAM_Segment__c: i % 7 === 6 ? 'Wider TAM' : 'Priority TAM',
    Region__c: REGION[name],
    Relationship_Status__c: pick(STATUSES),
    Last_Meaningful_Interaction_Date__c: r() < 0.7 ? localDate(shiftDays(now, -Math.floor(r() * 60), cfg), cfg) : null,
    Current_Payments_Platform_Vendor__c: pick(['ACI', 'Finastra', 'FIS', 'Volante', null]),
  }));
  accounts.push(
    { Id: id('001'), Name: 'Otoma', TAM_Segment__c: 'Partner / Analyst / Other', Region__c: 'UK and Ireland', Relationship_Status__c: null },
    { Id: id('001'), Name: 'Banfico', TAM_Segment__c: 'Partner / Analyst / Other', Region__c: 'UK and Ireland', Relationship_Status__c: 'Engaged' },
    { Id: id('001'), Name: 'Datos Insights', TAM_Segment__c: 'Partner / Analyst / Other', Region__c: 'Americas', Relationship_Status__c: null },
  );
  const byName = new Map(accounts.map((a) => [a.Name, a]));
  const otoma = byName.get('Otoma')!;

  // Contacts at bank accounts (priority and wider TAM).
  const contacts: Row[] = [];
  for (const a of accounts.filter((x) => x.TAM_Segment__c !== 'Partner / Analyst / Other')) {
    const n = pick([0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7]);
    for (let k = 0; k < n; k++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      const email = r() < 0.9 ? `${first}.${last}@${a.Name.toLowerCase().replace(/[^a-z]/g, '')}.example`.toLowerCase() : null;
      const warm = r() < 0.12;
      const active = r() < 0.06;
      contacts.push({
        Warm_Introduction_Available__c: warm,
        Introducer_Referred_By__c: warm && r() < 0.7 ? pick(['Peter', 'Tim', 'Banfico']) : null,
        Active_Deal_Contact__c: active,
        Next_Action_Current_Action__c: active && r() < 0.5 ? 'Book follow-up workshop' : null,
        Id: id('003'),
        Name: `${first} ${last}`,
        AccountId: a.Id,
        Account: { Name: a.Name },
        Contact_Persona__c: r() < 0.55 ? pick(PERSONAS) : null,
        Seniority__c: r() < 0.7 ? pick(['C-level', 'Head of', 'Director', 'Manager']) : null,
        LinkedIn_URL__c: r() < 0.75 ? `https://www.linkedin.com/in/${first}-${last}`.toLowerCase() : null,
        Email: email,
        Title: r() < 0.85 ? pick(['Head of Payments', 'CTO', 'Director, Transformation', 'COO', 'Head of Cash Management']) : null,
      });
    }
  }
  const contactsOf = (accountId: string) => contacts.filter((c) => c.AccountId === accountId);

  // Events across the trend window and the next week.
  const events: Row[] = [];
  const thisWeek = weekStart(now, cfg);
  const from = shiftWeeks(thisWeek, -(cfg.conversations.trendWeeks - 1), cfg);
  const at = (day: Date, hour: number, minute = 0) => new Date(day.getTime() + (hour * 60 + minute) * 60_000);
  const sibos = cfg.events.find((e) => /sibos/i.test(e.name));
  for (let day = from; day < shiftDays(now, 8, cfg); day = shiftDays(day, 1, cfg)) {
    const dow = new Date(localDate(day, cfg) + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const ds = localDate(day, cfg);
    const inSibos = !!sibos && ds >= sibos.start && ds <= sibos.end;
    const external = inSibos ? 5 + Math.floor(r() * 3) : Math.floor(r() * 4);
    for (let k = 0; k < external; k++) {
      const a = pick(accounts.filter((x) => x.TAM_Segment__c !== 'Partner / Analyst / Other'));
      const c = contactsOf(a.Id)[0];
      const start = at(day, 8 + Math.floor(r() * 9), pick([0, 30]));
      const dur = pick([15, 30, 30, 45, 60]);
      const linked = r() < 0.35;
      events.push({
        Id: id('00U'),
        Subject: linked && c ? `${c.Name.split(' ')[0]} (${a.Name}) <> Zack Connect` : inSibos ? `${a.Name} catch up at Sibos` : pick([`Otoma / ${a.Name}: Payments Transformation`, `${a.Name} intro`, `[External]---Zack Cohen and ${pick(FIRST)} ${pick(LAST)}`]),
        StartDateTime: iso(start),
        EndDateTime: iso(new Date(start.getTime() + dur * 60_000)),
        DurationInMinutes: dur,
        Location: inSibos ? 'Sibos, Miami' : pick(['Microsoft Teams Meeting', 'Microsoft Teams Meeting', 'https://us06web.zoom.us/j/123', null]),
        IsAllDayEvent: false,
        IsChild: false,
        WhoId: linked && c ? c.Id : null,
        Who: linked && c ? { Name: c.Name, Type: 'Contact' } : null,
        AccountId: linked ? a.Id : null,
        Account: linked ? { Name: a.Name, TAM_Segment__c: a.TAM_Segment__c } : null,
      });
    }
    // Internal, personal, cancelled and very short items the rule must reject.
    const internal = at(day, 8);
    events.push({ Id: id('00U'), Subject: 'Zack and Peter: weekly 1:1', StartDateTime: iso(internal), EndDateTime: iso(new Date(internal.getTime() + 1_800_000)), DurationInMinutes: 30, Location: 'Microsoft Teams Meeting', IsAllDayEvent: false, IsChild: false, WhoId: null, AccountId: null });
    events.push({ Id: id('00U'), Subject: pick(['Send follow up with POV', 'Sibos prep', 'wfh', 'Invoices']), StartDateTime: iso(day), EndDateTime: iso(shiftDays(day, 1, cfg)), DurationInMinutes: 1440, Location: null, IsAllDayEvent: true, IsChild: false, WhoId: null, AccountId: null });
    if (r() < 0.25) {
      const s = at(day, 10);
      events.push({ Id: id('00U'), Subject: `Canceled: ${pick(BANKS)} discovery call`, StartDateTime: iso(s), EndDateTime: iso(new Date(s.getTime() + 1_800_000)), DurationInMinutes: 30, Location: 'Microsoft Teams Meeting', IsAllDayEvent: false, IsChild: false, WhoId: null, AccountId: null });
    }
    if (r() < 0.2) {
      const s = at(day, 15);
      events.push({ Id: id('00U'), Subject: `${pick(BANKS)} quick call`, StartDateTime: iso(s), EndDateTime: iso(new Date(s.getTime() + 300_000)), DurationInMinutes: 5, Location: 'Microsoft Teams Meeting', IsAllDayEvent: false, IsChild: false, WhoId: null, AccountId: null });
    }
    if (r() < 0.3) {
      const s = at(day, 13);
      events.push({ Id: id('00U'), Subject: pick(['Barclays!', 'DB', 'Josh', 'NBG deck']), StartDateTime: iso(s), EndDateTime: iso(new Date(s.getTime() + 3_600_000)), DurationInMinutes: 60, Location: null, IsAllDayEvent: false, IsChild: false, WhoId: null, AccountId: null });
    }
  }
  // One linked meeting at Otoma itself, which must never count.
  const o = at(shiftDays(thisWeek, 1, cfg), 11);
  events.push({ Id: id('00U'), Subject: 'Otoma all-hands call', StartDateTime: iso(o), EndDateTime: iso(new Date(o.getTime() + 1_800_000)), DurationInMinutes: 30, Location: 'Microsoft Teams Meeting', IsAllDayEvent: false, IsChild: false, WhoId: null, AccountId: otoma.Id, Account: { Name: 'Otoma' } });

  // A few completed calls, some too short to count.
  const calls: Row[] = [];
  for (let k = 0; k < 10; k++) {
    const c = pick(contacts);
    const a = accounts.find((x) => x.Id === c.AccountId)!;
    calls.push({
      Id: id('00T'),
      Subject: `Call with ${c.Name}`,
      TaskSubtype: 'Call',
      Status: 'Completed',
      ActivityDate: localDate(shiftDays(now, -Math.floor(r() * 50), cfg), cfg),
      CallDurationInSeconds: pick([null, 45, 300, 900, 1500]),
      WhoId: c.Id,
      Who: { Name: c.Name, Type: 'Contact' },
      AccountId: a.Id,
      Account: { Name: a.Name, TAM_Segment__c: a.TAM_Segment__c },
    });
  }

  // Opportunities over the last 6 months.
  const opportunities: Row[] = [];
  const targets = accounts.filter((a) => a.TAM_Segment__c === 'Priority TAM');
  for (let k = 0; k < 26; k++) {
    const a = pick(targets);
    const created = shiftDays(shiftMonths(now, -Math.floor(r() * 6), cfg), -Math.floor(r() * 25), cfg);
    const closed = r() < 0.2;
    const won = closed && r() < 0.4;
    const bantN = pick([0, 1, 2, 2, 3, 3, 4, 4, 4]);
    const flags = [0, 1, 2, 3].sort(() => r() - 0.5).slice(0, bantN);
    const lastActivity = r() < 0.85 ? localDate(shiftDays(now, -Math.floor(r() * 40), cfg), cfg) : null;
    opportunities.push({
      Id: id('006'),
      Name: `${a.Name} ${pick(['ISO 20022 migration', 'Instant payments', 'Payments hub', 'Cross-border modernisation'])}`,
      AccountId: a.Id,
      Account: { Name: a.Name },
      StageName: won ? '7. Closed Won' : closed ? '8. Closed Lost' : pick(STAGES),
      Amount: r() < 0.85 ? Math.round(50 + r() * 450) * 1000 : null,
      Probability: r() < 0.8 ? pick([10, 20, 40, 60, 80]) : null,
      CloseDate: localDate(shiftDays(now, Math.floor(r() * 200) - 40, cfg), cfg),
      CreatedDate: iso(created),
      IsClosed: closed,
      IsWon: won,
      LastActivityDate: lastActivity,
      NextStep: r() < 0.6 ? pick(['Send proposal', 'Workshop with ops', 'Intro to CTO']) : null,
      // One opportunity uses picklist-style BANT values, to exercise both field types.
      Budget_Confirmed__c: k === 3 ? (flags.includes(0) ? 'Yes' : 'No') : flags.includes(0),
      Authority_Confirmed__c: flags.includes(1),
      Need_Confirmed__c: flags.includes(2),
      Timeline_Confirmed__c: flags.includes(3),
    });
  }
  const contactRoles = opportunities.filter((x) => !x.IsClosed).map((x) => ({ OpportunityId: x.Id, c: pick([1, 2, 2, 3, 5, 6]) }));

  // Two duplicated email addresses (one differs only in case), plus a contact with no account.
  for (const c of contacts.filter((x) => x.Email).slice(0, 2)) {
    contacts.push({ ...c, Id: id('003'), Email: String(c.Email).toUpperCase(), Warm_Introduction_Available__c: false, Active_Deal_Contact__c: false });
  }
  contacts.push({ Id: id('003'), Name: 'Orphan Contact', AccountId: null, Email: 'orphan@example.com' });

  return {
    events,
    calls,
    opportunities,
    contactRoles,
    accounts,
    // SOQL for contacts does not select Account fields; the app joins them in code.
    contacts: contacts.map(({ Account: _account, ...rest }) => rest),
    personaValues: PERSONAS.map((p) => ({ Value: p, IsActive: true })),
    campaign: contacts.slice(0, 14).map((c) => ({ Id: id('00v'), ContactId: c.Id, LeadId: null })),
  };
}

/** Synthetic weekly snapshots so the engagement trend has shape in mock mode. */
export function mockHistory(now: Date, cfg: KpiConfig) {
  const thisWeek = weekStart(now, cfg);
  return Array.from({ length: 8 }, (_, i) => ({
    weekStart: localDate(shiftWeeks(thisWeek, i - 8, cfg), cfg),
    byStatus: {},
    engagementRate: 18 + i * 1.5,
    healthScore: 50 + i,
  }));
}
