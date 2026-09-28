# Otoma GTM KPI tracker

A small dashboard of GTM KPIs, read live from Salesforce through the Zapier MCP server.
Read-only, cached, opened from a link (no password), and driven by one config file.

- **Headline KPIs:** genuine conversations per week, qualified opportunities per month, pipeline created
  this quarter against 3x bookings.
- **Market coverage** of Priority TAM accounts, **pipeline detail**, and a **CRM health score** with the
  action lists to work from.
- **Export weekly scorecard** downloads a one-page Markdown summary for the Monday debrief. **Print** uses
  a print stylesheet.

## Run it

```bash
cd kpi-tracker
npm install
MOCK=1 npm run dev          # fixture data, no network: http://localhost:3000
```

With real data:

```bash
cp .env.example .env        # set ZAPIER_MCP_URL (and optionally DASHBOARD_LINK_KEY)
npm run spike               # optional connection check (costs about 30 Zapier tasks)
npm run dev
```

Other commands: `npm test` (Vitest), `npm run typecheck`, `npm run build && npm start`.

To see the warning states in mock mode, set `MOCK_SCENARIO` to `truncated`, `empty` or `error`. With
`error`, first run once with `ok` so there is a last good result to fall back to.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ZAPIER_MCP_URL` | yes, unless `MOCK=1` | Contains a secret. Server-side only, never logged. |
| `ZAPIER_MCP_TOKEN` | no | Bearer token, for servers that use one. |
| `DASHBOARD_LINK_KEY` | no | Private link key. Unset means anyone with the URL can open it. |
| `MOCK`, `MOCK_SCENARIO` | no | Fixture data and warning scenarios. |
| `CACHE_DIR` | no | Default `.cache/`. Must be writable and persistent for the weekly history. |

## Changing definitions and targets

Everything lives in [`config/kpi.config.ts`](config/kpi.config.ts): targets, the conversation rule (meeting
signals, aliases, internal accounts), the BANT threshold, health weights and RAG thresholds, events such as
Sibos, the optional campaign card, and cache timings. The "How this is counted" text on the dashboard is
generated from this file ([`lib/definitions.ts`](lib/definitions.ts)), so the wording always matches the
maths. Bump `version` when you change a rule. It shows in the footer.

Common changes:

- **Bookings target agreed:** set `targets.bookingsTarget`. Until then the pipeline tile says "Target not
  set" and never shows a percentage.
- **BANT threshold agreed with Peter:** `qualification.qualifiedMinBant`.
- **A meeting was not counted:** open "Check the rule" under Conversations. Each meeting there shows why it
  was left out. Add a signal to `subjectSignals` or `locationSignals`, or an alias to `accountAliases`
  (for example `NBG: 'National Bank of Greece'`).
- **Buy Atlas campaign:** set `campaign.nameLike` and the card appears.

### How conversations are counted (rule b)

A finished, timed Event of at least 10 minutes that looks like a meeting (a Teams, Zoom or Meet location, a
stand or booth, or a subject signal such as "call", "intro" or "<>") counts if either:

- it is linked to a Contact or to a non-Otoma Account, or
- it has no link, but its subject names a Salesforce account (or an alias) or contains "[External]".

Cancelled and declined invites are excluded. Completed call Tasks linked to a Contact or Account also count,
but none are logged in Salesforce yet, so a warning says so. To drop calls, set
`conversations.includeCalls: false`.

## How it works

```
Browser -> /api/kpis (cached) -> refresh() -> calculators (pure) -> SalesforceClient
                                                                     |- ZapierMcpClient (real)
                                                                     |- MockClient (MOCK=1)
```

- **Read-only:** [`lib/soql-guard.ts`](lib/soql-guard.ts) rejects anything that is not a single SELECT, and
  refuses any tool whose name implies a write. Both checks run before every call.
- **Zapier quirks, found in Phase 0:**
  - Results are capped at 2,000 rows with no cursor. The client pages with `Id > lastId` (keyset) and warns
    on the dashboard if a result may be truncated.
  - `SELECT COUNT()` comes back empty, so aggregates always use `COUNT(Id) alias`.
  - The client handles both Zapier server shapes: a direct `salesforce_custom_soql_query` tool, or
    `execute_zapier_read_action`.
- **Cache:** results are held in memory and in `CACHE_DIR/kpis.json` for 30 minutes. If a refresh fails,
  the last good result stays on screen with a warning giving the error and the age of the data. Manual
  refresh is limited to once every 5 minutes. One snapshot per week goes to `CACHE_DIR/history.json` for
  the engagement trend.

## Zapier cost

Every Zapier MCP tool call uses tasks from your Zapier plan. **The plan's task limit was reached during
the Phase 0 checks**, so check the plan before relying on live data.

- **One refresh costs about 8 calls:** Events, Tasks, Opportunities, contact roles, Accounts, Contacts
  (2 pages for about 2,200 contacts) and the persona picklist. A meta-tool server also needs 2 lookup
  calls once per server start.
- **Contacts are pulled in one paged query** and the contact lists are derived in code. That is cheaper
  than six filtered queries, and it avoids Contact queries filtered on Account fields, which time out
  through Zapier.
- **The page does not poll.** It refreshes only on load when the cache is older than the TTL, or when you
  press Refresh.

Rough monthly cost at 8 calls per refresh (check whether your plan bills more than one task per call):

| Usage | Refreshes a day | Calls a month (22 working days) |
|---|---|---|
| Monday review only | about 1 a week | about 35 |
| A few looks a day | 4 | about 700 |
| Open all day, 30-minute cache | 16 | about 2,800 |

To cut cost further, raise `cache.ttlMinutes` (for example to 240).

## Deploying and sharing the link

There is no password. Open the dashboard straight from its URL.

- **Open link (default):** with `DASHBOARD_LINK_KEY` unset, anyone who has or guesses the URL can see it,
  including bank contact names. Pages send `noindex` headers, but that is not access control.
- **Private link (recommended):** set `DASHBOARD_LINK_KEY` to a long random string (for example the
  output of `openssl rand -hex 16`) and bookmark or share `https://<host>/?key=<that string>`. The key is
  saved in a cookie for a year and removed from the address bar, so the plain URL keeps working in that
  browser. Anyone without the key gets a 404. To revoke access, change the key.

- **Render, Railway or Fly.io (recommended):** set the root directory to `kpi-tracker`, the build command
  to `npm install && npm run build`, and the start command to `npm start`. Attach a small persistent disk
  and point `CACHE_DIR` at it, so the cache and the weekly history survive restarts.
- **Vercel:** set the project's root directory to `kpi-tracker`. The filesystem is not persistent, so set
  `CACHE_DIR=/tmp/gtm-kpis`. The cache still works per instance, but the weekly history will reset.
  Consider adding Vercel Deployment Protection as well.

Secrets stay on the server. The browser only ever calls `/api/kpis` and `/api/refresh`, and no
environment variable is exposed to the client bundle.

## Known data gaps (September 2026)

- **Every open opportunity has a blank Amount,** so pipeline reads £0 and a warning says so.
- **Only 2 of about 2,200 contacts have a persona,** so persona gaps are high. The persona values come
  from the picklist definition.
- **Most calendar Events have no Contact or Account link.** Rule (b) matches them from the subject instead.
- **No call Tasks are logged.**
