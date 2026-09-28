import "server-only";
import type { Account, AccountSummary, Activity, CheatSheet, Contact } from "@/lib/types";
import {
  describeFields,
  existingFields,
  instanceUrl,
  isSalesforceId,
  query,
  soqlLike,
  soqlString,
  updateRecord,
} from "./client";
import * as demo from "./demo";

export const isDemoMode = () => process.env.SALESFORCE_MODE?.trim().toLowerCase() === "demo";

const PRIMARY_FIELD = process.env.SF_PRIMARY_CONTACT_FIELD?.trim() || "Primary_Contact__c";
const RESOURCES_FIELD = process.env.SF_RESOURCES_FIELD?.trim() || "Quick_Access_Resources__c";
const NEWS_TERM_FIELD = process.env.SF_NEWS_TERM_FIELD?.trim() || "News_Search_Term__c";

type Rec = Record<string, unknown> & { Id: string };

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
const rel = (r: Rec, relName: string, field = "Name") =>
  str((r[relName] as Record<string, unknown> | null | undefined)?.[field]);
// SOQL field names are case-insensitive but JSON keys echo the describe casing.
const pick = (r: Rec, field: string) => {
  const key = Object.keys(r).find((k) => k.toLowerCase() === field.toLowerCase());
  return key ? r[key] : undefined;
};

const SUMMARY_FIELDS = [
  "Id",
  "Name",
  "Type",
  "Relationship_Status__c",
  "Region__c",
  "Country__c",
  "Owner.Name",
  "LastActivityDate",
];

function toSummary(r: Rec): AccountSummary {
  return {
    id: r.Id,
    name: String(r.Name ?? "Untitled account"),
    type: str(r.Type),
    relationshipStatus: str(pick(r, "Relationship_Status__c")),
    region: str(pick(r, "Region__c")),
    country: str(pick(r, "Country__c")),
    ownerName: rel(r, "Owner"),
    lastActivityDate: str(r.LastActivityDate),
  };
}

export async function searchAccounts(term: string): Promise<AccountSummary[]> {
  if (isDemoMode()) return demo.searchAccounts(term);

  const fields = await existingFields("Account", SUMMARY_FIELDS);
  const t = term.trim();
  const soql = t
    ? `SELECT ${fields.join(", ")} FROM Account WHERE Name LIKE '%${soqlLike(t)}%' ORDER BY Name LIMIT 50`
    : `SELECT ${fields.join(", ")} FROM Account ORDER BY LastModifiedDate DESC LIMIT 25`;
  return (await query<Rec>(soql, { maxRecords: 50 })).map(toSummary);
}

export async function getCheatSheet(accountId: string): Promise<CheatSheet | null> {
  if (!isSalesforceId(accountId)) return null;
  if (isDemoMode()) return demo.getCheatSheet(accountId);

  const [accountFields, contactFields, contactDescribe] = await Promise.all([
    existingFields("Account", [
      ...SUMMARY_FIELDS,
      "Website",
      "Industry",
      "TAM_Segment__c",
      "Current_Payments_Platform_Vendor__c",
      "Account_Relationship_Summary__c",
      "Account_Strategic_Notes__c",
      RESOURCES_FIELD,
      NEWS_TERM_FIELD,
    ]),
    existingFields("Contact", ["Id", "Name", "Title", "Email", "Phone", PRIMARY_FIELD]),
    describeFields("Contact"),
  ]);
  const primaryField = contactDescribe.get(PRIMARY_FIELD.toLowerCase());
  const id = soqlString(accountId);

  const [accounts, contacts, tasks, base] = await Promise.all([
    query<Rec>(`SELECT ${accountFields.join(", ")} FROM Account WHERE Id = '${id}' LIMIT 1`),
    query<Rec>(
      `SELECT ${contactFields.join(", ")} FROM Contact WHERE AccountId = '${id}' ` +
        `ORDER BY LastName ASC NULLS LAST, FirstName ASC NULLS LAST LIMIT 500`,
      { maxRecords: 500 },
    ),
    query<Rec>(
      `SELECT Id, Subject, ActivityDate, CreatedDate, Status, IsClosed, TaskSubtype, Who.Name, Owner.Name ` +
        `FROM Task WHERE WhatId = '${id}' AND IsDeleted = false ` +
        `ORDER BY ActivityDate DESC NULLS LAST, CreatedDate DESC LIMIT 500`,
      { includeArchived: true, maxRecords: 500 },
    ),
    instanceUrl(),
  ]);

  const a = accounts[0];
  if (!a) return null;

  const account: Account = {
    ...toSummary(a),
    website: str(a.Website),
    industry: str(a.Industry),
    tamSegment: str(pick(a, "TAM_Segment__c")),
    paymentsVendor: str(pick(a, "Current_Payments_Platform_Vendor__c")),
    relationshipSummary: str(pick(a, "Account_Relationship_Summary__c")),
    strategicNotes: str(pick(a, "Account_Strategic_Notes__c")),
    resourcesRaw: str(pick(a, RESOURCES_FIELD)),
    newsSearchTerm: str(pick(a, NEWS_TERM_FIELD)),
  };

  return {
    account,
    contacts: contacts.map(
      (c): Contact => ({
        id: c.Id,
        name: String(c.Name ?? "Unnamed contact"),
        title: str(c.Title),
        email: str(c.Email),
        phone: str(c.Phone),
        isPrimary: pick(c, PRIMARY_FIELD) === true,
      }),
    ),
    activities: tasks.map(
      (t): Activity => ({
        id: t.Id,
        subject: str(t.Subject) ?? "(no subject)",
        activityDate: str(t.ActivityDate),
        createdDate: String(t.CreatedDate),
        status: str(t.Status),
        isClosed: t.IsClosed === true,
        type: t.TaskSubtype === "Task" ? null : str(t.TaskSubtype),
        whoName: rel(t, "Who"),
        ownerName: rel(t, "Owner"),
      }),
    ),
    canPinContacts: Boolean(primaryField?.updateable),
    salesforceUrl: `${base}/lightning/r/Account/${accountId}/view`,
    fetchedAt: new Date().toISOString(),
    demo: false,
  };
}

/** Writes the primary flag back to Salesforce, after checking the contact belongs to the account. */
export async function setPrimaryContact(accountId: string, contactId: string, isPrimary: boolean) {
  if (!isSalesforceId(accountId) || !isSalesforceId(contactId)) throw new Error("Invalid record id");
  if (isDemoMode()) return demo.setPrimaryContact(contactId, isPrimary);

  const [owner] = await query<Rec>(
    `SELECT Id, AccountId FROM Contact WHERE Id = '${soqlString(contactId)}' LIMIT 1`,
  );
  const ownerAccount = owner ? String(owner.AccountId ?? "") : "";
  if (!owner || ownerAccount.slice(0, 15) !== accountId.slice(0, 15)) {
    throw new Error("Contact does not belong to this account");
  }
  await updateRecord("Contact", contactId, { [PRIMARY_FIELD]: isPrimary });
}
