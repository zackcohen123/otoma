import "server-only";
import { createSign } from "node:crypto";

/**
 * Server-to-server Salesforce auth. No user ever logs in and no refresh token
 * is stored: both supported flows mint a fresh access token on demand from
 * credentials that live only in environment variables, so the app re-auths
 * itself whenever a session expires.
 *
 *  - client_credentials: consumer key + secret, runs as the app's "Run As" user.
 *  - jwt_bearer: consumer key + a certificate's private key + a username.
 */

export type SfSession = { accessToken: string; instanceUrl: string; flow: AuthFlow };
type AuthFlow = "client_credentials" | "jwt_bearer";

export class SalesforceConfigError extends Error {
  constructor(public missing: string[]) {
    super(`Salesforce is not configured. Missing: ${missing.join(", ")}`);
    this.name = "SalesforceConfigError";
  }
}

export class SalesforceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesforceAuthError";
  }
}

function env(name: string) {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function readPrivateKey(raw: string) {
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  return Buffer.from(raw, "base64").toString("utf8");
}

export function authConfig() {
  const loginUrl = env("SF_LOGIN_URL")?.replace(/\/+$/, "");
  const clientId = env("SF_CLIENT_ID");
  const secret = env("SF_CLIENT_SECRET");
  const jwtKey = env("SF_JWT_PRIVATE_KEY");
  const username = env("SF_USERNAME");
  const flow: AuthFlow = jwtKey ? "jwt_bearer" : "client_credentials";

  const missing: string[] = [];
  if (!loginUrl) missing.push("SF_LOGIN_URL");
  if (!clientId) missing.push("SF_CLIENT_ID");
  if (flow === "client_credentials" && !secret) missing.push("SF_CLIENT_SECRET (or SF_JWT_PRIVATE_KEY)");
  if (flow === "jwt_bearer" && !username) missing.push("SF_USERNAME");

  return { loginUrl: loginUrl!, clientId: clientId!, secret, jwtKey, username, flow, missing };
}

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function buildJwt(clientId: string, username: string, audience: string, privateKey: string) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: clientId, sub: username, aud: audience, exp: Math.floor(Date.now() / 1000) + 180 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;
}

function jwtAudience(loginUrl: string) {
  // Salesforce expects the generic login host as `aud`, not My Domain.
  return /(\.sandbox\.my\.salesforce\.com|test\.salesforce\.com)/.test(loginUrl)
    ? "https://test.salesforce.com"
    : "https://login.salesforce.com";
}

async function requestToken(): Promise<SfSession> {
  const cfg = authConfig();
  if (cfg.missing.length) throw new SalesforceConfigError(cfg.missing);

  const body = new URLSearchParams();
  if (cfg.flow === "jwt_bearer") {
    body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
    body.set(
      "assertion",
      buildJwt(cfg.clientId, cfg.username!, jwtAudience(cfg.loginUrl), readPrivateKey(cfg.jwtKey!)),
    );
  } else {
    body.set("grant_type", "client_credentials");
    body.set("client_id", cfg.clientId);
    body.set("client_secret", cfg.secret!);
  }

  const res = await fetch(`${cfg.loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok || !json.access_token) {
    throw new SalesforceAuthError(
      `Salesforce token request failed (${cfg.flow}, HTTP ${res.status}): ${json.error ?? ""} ${json.error_description ?? ""}`.trim(),
    );
  }
  return { accessToken: json.access_token, instanceUrl: json.instance_url, flow: cfg.flow };
}

// One token per server instance, shared across requests; concurrent callers
// wait on the same in-flight request instead of each minting a token.
let cached: SfSession | null = null;
let inflight: Promise<SfSession> | null = null;

export async function getSession(): Promise<SfSession> {
  if (cached) return cached;
  inflight ??= requestToken().finally(() => {
    inflight = null;
  });
  cached = await inflight;
  return cached;
}

/** Drop the cached token (after a 401) so the next call re-authenticates. */
export function invalidateSession(stale: SfSession) {
  if (cached?.accessToken === stale.accessToken) cached = null;
}
