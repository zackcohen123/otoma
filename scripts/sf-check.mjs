// Verifies Salesforce credentials from .env.local without starting the app:
//   npm run sf:check
// Prints the auth flow, the instance, and which of the expected fields exist.
import { createSign } from "node:crypto";

const env = (k) => process.env[k]?.trim() || undefined;
const loginUrl = env("SF_LOGIN_URL")?.replace(/\/+$/, "");
const clientId = env("SF_CLIENT_ID");
const jwtKey = env("SF_JWT_PRIVATE_KEY");
const version = env("SF_API_VERSION") || "v63.0";
if (!loginUrl || !clientId) {
  console.error("Set SF_LOGIN_URL and SF_CLIENT_ID in .env.local first.");
  process.exit(1);
}

const body = new URLSearchParams();
if (jwtKey) {
  const key = jwtKey.includes("BEGIN") ? jwtKey.replace(/\\n/g, "\n") : Buffer.from(jwtKey, "base64").toString();
  const aud = /sandbox|test\.salesforce/.test(loginUrl) ? "https://test.salesforce.com" : "https://login.salesforce.com";
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256" })}.${enc({ iss: clientId, sub: env("SF_USERNAME"), aud, exp: Math.floor(Date.now() / 1000) + 180 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  body.set("assertion", `${unsigned}.${sig}`);
} else {
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", env("SF_CLIENT_SECRET") ?? "");
}

const tok = await (await fetch(`${loginUrl}/services/oauth2/token`, { method: "POST", body })).json();
if (!tok.access_token) {
  console.error("✗ Token request failed:", tok);
  process.exit(1);
}
console.log(`✓ Authenticated via ${jwtKey ? "JWT bearer" : "client credentials"} → ${tok.instance_url}`);

const get = async (path) =>
  (await fetch(`${tok.instance_url}/services/data/${version}${path}`, { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();

const expected = {
  Account: [
    "Relationship_Status__c", "TAM_Segment__c", "Region__c", "Country__c",
    "Current_Payments_Platform_Vendor__c", "Account_Relationship_Summary__c", "Account_Strategic_Notes__c",
    env("SF_RESOURCES_FIELD") || "Quick_Access_Resources__c", env("SF_NEWS_TERM_FIELD") || "News_Search_Term__c",
  ],
  Contact: [env("SF_PRIMARY_CONTACT_FIELD") || "Primary_Contact__c"],
};
for (const [obj, fields] of Object.entries(expected)) {
  const d = await get(`/sobjects/${obj}/describe`);
  const byName = new Map((d.fields ?? []).map((f) => [f.name.toLowerCase(), f]));
  for (const f of fields) {
    const info = byName.get(f.toLowerCase());
    console.log(`${info ? "✓" : "·"} ${obj}.${f}${info ? (info.updateable ? " (read/write)" : " (read-only)") : " — not found or not visible (optional fields are skipped)"}`);
  }
}
const q = await get(`/query?q=${encodeURIComponent("SELECT COUNT() FROM Account")}`);
console.log(`✓ ${q.totalSize} accounts visible to the integration user`);
