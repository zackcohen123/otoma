import "server-only";
import type { AccountSummary, Activity, CheatSheet, Contact } from "@/lib/types";

/**
 * Sample data for SALESFORCE_MODE=demo only — lets you preview the UI before
 * Salesforce credentials exist. Every page shows a "Demo data" banner in this mode.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type DemoAccount = CheatSheet["account"];

const accounts: DemoAccount[] = [
  {
    id: "001DEMO00000000001",
    name: "Northwind Freight",
    type: "Prospect",
    relationshipStatus: "Active evaluation",
    region: "EMEA",
    country: "Netherlands",
    ownerName: "Demo Rep",
    lastActivityDate: daysAgo(2),
    website: "https://example.com",
    industry: "Logistics",
    tamSegment: "Enterprise",
    paymentsVendor: "Legacy in-house",
    relationshipSummary:
      "Champion: Head of Finance Ops, brought us in after a failed payouts migration.\n\nThey are comparing us against two vendors. Decision expected end of quarter.\n\n- Pain: manual reconciliation across 14 entities\n- Budget: approved for this fiscal year\n- Risk: IT security review not yet started",
    strategicNotes:
      "Lead with the reconciliation story, not pricing.\nSecurity review is the likely blocker, so offer the SOC 2 pack early.",
    resourcesRaw: "Otoma POV (PDF) | https://example.com/pov.pdf\nLogistics case study |",
    newsSearchTerm: null,
  },
  {
    id: "001DEMO00000000002",
    name: "Harbor Health Group",
    type: "Customer",
    relationshipStatus: "At risk",
    region: "North America",
    country: "United States",
    ownerName: "Demo Rep",
    lastActivityDate: daysAgo(97),
    website: null,
    industry: "Healthcare",
    tamSegment: "Mid-market",
    paymentsVendor: "Otoma",
    relationshipSummary: "Renewal in 60 days. Usage down 30% since their CFO left.",
    strategicNotes: null,
    resourcesRaw: null,
    newsSearchTerm: null,
  },
];

const contacts: Record<string, Contact[]> = {
  "001DEMO00000000001": [
    { id: "003DEMO00000000001", name: "Ana de Vries", title: "Head of Finance Operations", email: "ana@example.com", phone: null, isPrimary: true },
    { id: "003DEMO00000000002", name: "Joost Bakker", title: "CFO", email: "joost@example.com", phone: "+31 20 000 0000", isPrimary: false },
    { id: "003DEMO00000000003", name: "Priya Raman", title: "IT Security Lead", email: "priya@example.com", phone: null, isPrimary: false },
    { id: "003DEMO00000000004", name: "Tom Hendriks", title: "Treasury Analyst", email: null, phone: null, isPrimary: false },
  ],
  "001DEMO00000000002": [
    { id: "003DEMO00000000005", name: "Marcus Lee", title: "VP Finance", email: "marcus@example.com", phone: null, isPrimary: false },
  ],
};

const task = (id: number, subject: string, ago: number, status = "Completed", type: string | null = "Call"): Activity => ({
  id: `00TDEMO0000000${String(id).padStart(4, "0")}`,
  subject,
  activityDate: daysAgo(ago),
  createdDate: new Date(Date.now() - ago * 86_400_000).toISOString(),
  status,
  isClosed: status === "Completed",
  type,
  whoName: null,
  ownerName: "Demo Rep",
});

const activities: Record<string, Activity[]> = {
  "001DEMO00000000001": [
    task(1, "Send SOC 2 pack to Priya", -3, "Not Started", "Email"),
    task(2, "Pricing follow-up", 2),
    task(3, "Demo: reconciliation workflow", 5, "Completed", "Meeting"),
    task(4, "Intro email to CFO", 6, "Completed", "Email"),
    task(5, "Discovery call", 9),
    task(6, "Send security questionnaire", 12, "Not Started", "Email"),
    task(7, "Inbound from website", 40, "Completed", "Email"),
  ],
  "001DEMO00000000002": [task(8, "QBR", 97, "Completed", "Meeting")],
};

export function searchAccounts(term: string): AccountSummary[] {
  const t = term.trim().toLowerCase();
  return accounts.filter((a) => !t || a.name.toLowerCase().includes(t));
}

export function getCheatSheet(id: string): CheatSheet | null {
  const account = accounts.find((a) => a.id === id);
  if (!account) return null;
  return {
    account,
    contacts: contacts[id] ?? [],
    activities: activities[id] ?? [],
    canPinContacts: true,
    salesforceUrl: null,
    fetchedAt: new Date().toISOString(),
    demo: true,
  };
}

export function setPrimaryContact(contactId: string, isPrimary: boolean) {
  for (const list of Object.values(contacts)) {
    const c = list.find((x) => x.id === contactId);
    if (c) c.isPrimary = isPrimary;
  }
}
