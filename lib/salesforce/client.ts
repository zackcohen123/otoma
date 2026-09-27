import "server-only";
import { getSession, invalidateSession } from "./auth";

const API_VERSION = process.env.SF_API_VERSION?.trim() || "v63.0";

export class SalesforceApiError extends Error {
  constructor(public status: number, public errorCode: string, message: string) {
    super(message);
    this.name = "SalesforceApiError";
  }
}

/** REST call against the org. Re-authenticates once if the session expired. */
async function sfFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const session = await getSession();
  const res = await fetch(`${session.instanceUrl}/services/data/${API_VERSION}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (res.status === 401 && !retried) {
    invalidateSession(session);
    return sfFetch(path, init, true);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errorCode?: string; message?: string }[] | null;
    const first = Array.isArray(body) ? body[0] : undefined;
    throw new SalesforceApiError(
      res.status,
      first?.errorCode ?? "HTTP_" + res.status,
      first?.message ?? `Salesforce request failed: ${res.status} ${path}`,
    );
  }
  return res;
}

export async function instanceUrl() {
  return (await getSession()).instanceUrl;
}

type QueryResult<T> = { totalSize: number; done: boolean; records: T[]; nextRecordsUrl?: string };

/**
 * Run SOQL and follow pagination. `includeArchived` uses queryAll so Tasks
 * older than a year (which Salesforce archives) still show up; callers must
 * then filter `IsDeleted = false` themselves.
 */
export async function query<T>(soql: string, { includeArchived = false, maxRecords = 2000 } = {}) {
  const endpoint = includeArchived ? "queryAll" : "query";
  let res = (await (await sfFetch(`/${endpoint}?q=${encodeURIComponent(soql)}`)).json()) as QueryResult<T>;
  const records = [...res.records];
  while (!res.done && res.nextRecordsUrl && records.length < maxRecords) {
    const next = res.nextRecordsUrl.replace(/^\/services\/data\/v[\d.]+/, "");
    res = (await (await sfFetch(next)).json()) as QueryResult<T>;
    records.push(...res.records);
  }
  return records;
}

export async function updateRecord(sobject: string, id: string, fields: Record<string, unknown>) {
  await sfFetch(`/sobjects/${sobject}/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
}

export type FieldInfo = { name: string; type: string; updateable: boolean; label: string; htmlFormatted: boolean };

// Schema changes rarely; keep describes for 10 minutes per server instance.
const describeCache = new Map<string, { at: number; fields: Map<string, FieldInfo> }>();
const DESCRIBE_TTL_MS = 10 * 60 * 1000;

export async function describeFields(sobject: string): Promise<Map<string, FieldInfo>> {
  const hit = describeCache.get(sobject);
  if (hit && Date.now() - hit.at < DESCRIBE_TTL_MS) return hit.fields;

  const json = (await (await sfFetch(`/sobjects/${sobject}/describe`)).json()) as { fields: FieldInfo[] };
  const fields = new Map(json.fields.map((f) => [f.name.toLowerCase(), f]));
  describeCache.set(sobject, { at: Date.now(), fields });
  return fields;
}

/** Keep only the field names that exist on the object, so optional custom fields never break a query. */
export async function existingFields(sobject: string, names: string[]) {
  const fields = await describeFields(sobject);
  return names.filter((n) => n.includes(".") || fields.has(n.toLowerCase()));
}

export function isSalesforceId(id: string) {
  return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id);
}

export function soqlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function soqlLike(value: string) {
  return soqlString(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}
