# Connecting Salesforce

This is a one-time setup. When it's done, the app authenticates on its own server to server. It never
stores a user's password or a refresh token. Every time it needs a session, it mints a fresh access token
from the app credentials in its environment variables. When Salesforce expires that session, the next
request gets a `401`, and the app re-authenticates and retries. Nobody touches credentials again unless
you rotate the secret.

**Why not an MCP server?** A Salesforce MCP server connects Salesforce to an AI client such as Claude,
not to a deployed website. The cheat sheet's server has to call the Salesforce REST API directly. So
it uses an OAuth app with the **Client Credentials** flow (recommended) or the **JWT Bearer** flow. The
username-password flow is blocked by default in current orgs and isn't supported here.

---

## 1. Create an integration user (recommended)

The app reads data as a single "Run As" user, so it sees exactly what that user can see.

1. **Setup → Users → New User.** Use the **Salesforce Integration** license with the
   **Minimum Access – API Only Integrations** profile. Most orgs get several of these licenses free.
2. Create a **permission set**, for example "Otoma Cheat Sheet", and assign it to that user:
   - **Object settings:**
     - Account: Read, View All
     - Contact: Read, Edit, View All
     - Task/Activities: Read
   - **Field-level security:** Read on every field listed in step 2 below, and **Edit** on
     `Contact.Primary_Contact__c`.
   - **System permission:** API Enabled.

If you'd rather run as an existing admin user, that works too. The app will then see everything that
user sees.

## 2. Custom fields

The app reads these if they exist and skips any that don't, so nothing breaks while you're still adding
them.

| Object  | Field API name                        | Type                          | Used for                  |
|---------|---------------------------------------|-------------------------------|---------------------------|
| Account | `Relationship_Status__c`              | (yours)                       | Identity badge            |
| Account | `TAM_Segment__c`, `Region__c`, `Country__c`, `Current_Payments_Platform_Vendor__c` | (yours) | Quick facts |
| Account | `Account_Relationship_Summary__c`, `Account_Strategic_Notes__c` | Long / Rich Text Area | Relationship snapshot |
| Contact | **`Primary_Contact__c`** (new)        | Checkbox, default unchecked   | ★ primary contact pins    |
| Account | **`Quick_Access_Resources__c`** (new) | Long Text Area (32,768), 6 lines | Quick Access panel     |
| Account | `News_Search_Term__c` (optional, new) | Text(255)                     | Overrides the news query  |

`Quick_Access_Resources__c` takes one resource per line:

```
Otoma POV (PDF) | https://drive.google.com/…
Payments case study | https://…
ROI one-pager |
```

A line with no URL after the `|` shows as **Pending**. A line whose label matches a default in
`config/resources.ts` (for example `One-pager`) replaces that default for this account.

`News_Search_Term__c` fixes noisy news results for generic names. For example, for an account named
"Square", set it to `"Block Inc" OR "Square payments"`.

## 3. Create the OAuth app

Salesforce now creates new integrations as **External Client Apps**. Orgs created before Spring '26 may
still allow **App Manager → New Connected App**. The settings are the same either way.

1. **Setup → Quick Find "External Client App Manager" → New External Client App**
   - Name: `Otoma Cheat Sheet`, Distribution State: **Local**
   - **Enable OAuth**
     - Callback URL: `https://localhost/callback`. This is required by the form but never used.
     - OAuth scopes: **Manage user data via APIs (api)**
     - Flow enablement: check **Enable Client Credentials Flow**
   - Create.
2. Open the app → **Policies** tab → **Edit**:
   - OAuth policies → Permitted users: **Admin approved users are pre-authorized**, then add the
     permission set from step 1.
   - **Client Credentials Flow → Run As:** the integration user.
   - Save.
3. **Settings** tab → OAuth Settings → **Consumer Key and Secret**. Copy both.
4. Note your **My Domain** URL: **Setup → My Domain**, for example
   `https://yourcompany.my.salesforce.com`.

Allow a few minutes for the changes to propagate.

## 4. Configure the app

In `.env.local` for local runs, or in Vercel → Project → Settings → Environment Variables:

```
SF_LOGIN_URL=https://yourcompany.my.salesforce.com
SF_CLIENT_ID=<consumer key>
SF_CLIENT_SECRET=<consumer secret>
```

Then run:

```
npm run sf:check
```

It confirms the token works and lists which of the fields above the integration user can see. On a
deployed app, `GET /api/health` runs a similar check and never prints secrets.

### Alternative: JWT Bearer flow

Use this if your security team prefers certificates over a client secret:

```
openssl req -x509 -newkey rsa:2048 -nodes -keyout server.key -out server.crt -days 730 -subj "/CN=otoma-cheat-sheet"
```

1. In the app's OAuth settings, enable **Use digital signatures** and upload `server.crt`. The Client
   Credentials flow isn't needed.
2. Pre-authorize the integration user through the permission set, as above.
3. Set these variables:
   ```
   SF_LOGIN_URL=https://yourcompany.my.salesforce.com
   SF_CLIENT_ID=<consumer key>
   SF_USERNAME=integration.user@yourcompany.com
   SF_JWT_PRIVATE_KEY=<contents of server.key, base64-encoded: base64 -w0 server.key>
   ```

If `SF_JWT_PRIVATE_KEY` is set, the app uses the JWT flow. Never commit `server.key`; `.gitignore`
already excludes `*.key` and `*.pem`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `invalid_grant: no client credentials user enabled` | Set **Run As** in the app's Policies tab. |
| `invalid_client_id` right after creating the app | Wait 2–10 minutes for the app to propagate. |
| `invalid_grant: user hasn't approved this consumer` (JWT) | Pre-authorize the user through the permission set or profile on the app's policies. |
| A field shows "—" everywhere | The integration user lacks field-level security on it. Check with `npm run sf:check`. |
| Pin star is greyed out | `Contact.Primary_Contact__c` is missing or not editable for the integration user. |
| Timeline is empty but you see Tasks in Salesforce | The Tasks are attached to a Contact or Opportunity (`WhatId`), not to the Account itself. |
