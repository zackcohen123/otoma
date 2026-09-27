export type AccountSummary = {
  id: string;
  name: string;
  type: string | null;
  relationshipStatus: string | null;
  region: string | null;
  country: string | null;
  ownerName: string | null;
  lastActivityDate: string | null;
};

export type Account = AccountSummary & {
  website: string | null;
  industry: string | null;
  tamSegment: string | null;
  paymentsVendor: string | null;
  relationshipSummary: string | null;
  strategicNotes: string | null;
  resourcesRaw: string | null;
  newsSearchTerm: string | null;
};

export type Contact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

export type Activity = {
  id: string;
  subject: string;
  activityDate: string | null;
  createdDate: string;
  status: string | null;
  isClosed: boolean;
  type: string | null;
  whoName: string | null;
  ownerName: string | null;
};

export type CheatSheet = {
  account: Account;
  contacts: Contact[];
  activities: Activity[];
  /** false when Contact.Primary_Contact__c is missing or not writable for the integration user. */
  canPinContacts: boolean;
  salesforceUrl: string | null;
  fetchedAt: string;
  demo: boolean;
};
