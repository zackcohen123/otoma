# Otoma Account Cheat Sheet

A pre-call briefing page for any Salesforce Account. Search for a company, open its sheet, and in under a
minute you have its identity, relationship notes, contacts, engagement history, resources, and recent
news.

- **Landing (`/`):** live search over every Account in the org. With no query, it lists recently updated
  accounts.
- **Cheat sheet (`/a/<AccountId>`):**
  - **Identity and quick facts.**
  - **Relationship snapshot**, rendered as readable prose.
  - **Contacts.** Primary contacts are ★-pinned. The pin writes back to `Contact.Primary_Contact__c`.
  - **Engagement timeline** from Tasks where `WhatId` = Account, with:
    - an "N touches in the last N days" callout when activity is dense
    - rust flags for stale accounts (no touch in 60+ days) and overdue tasks
  - **Quick Access resources**, with a Pending state for resources that have no link yet.
  - **Recent news** from GNews.

## Stack

**Next.js 16 (App Router) on Vercel.** All Salesforce and GNews calls run in server components and server
actions, so tokens and API keys never reach the browser. There's no database. Salesforce is the store
for data and for the primary-contact pins.

- **Salesforce data** is fetched on every page load (`force-dynamic`, `no-store`), so it always matches
  the org. Only the field-schema lookup is cached, for 10 minutes. It lets optional custom fields go
  missing without breaking queries.
- **News** is cached for 6 hours per company in Next's data cache (`unstable_cache`), which persists
  across serverless instances on Vercel. Failed lookups are not cached.
- **Auth to Salesforce** is server to server (Client Credentials or JWT Bearer). The app mints and
  re-mints its own tokens, so no one logs in. See **[docs/salesforce-setup.md](docs/salesforce-setup.md)**.

## Run locally

```bash
npm install
cp .env.example .env.local           # fill in the Salesforce and GNews values
npm run sf:check                     # verify Salesforce credentials and fields
npm run dev                          # http://localhost:3000
```

To look at the UI before you have credentials, set `SALESFORCE_MODE=demo`. Every page then shows a
"Demo data" banner.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `SF_LOGIN_URL`, `SF_CLIENT_ID` | yes | My Domain URL and consumer key |
| `SF_CLIENT_SECRET` | one of these | Client Credentials flow |
| `SF_USERNAME` + `SF_JWT_PRIVATE_KEY` | one of these | JWT Bearer flow |
| `GNEWS_API_KEY` | for news | Free key from gnews.io |
| `NEWS_CACHE_HOURS` | no | Default `6` |
| `APP_TIMEZONE` | no | IANA name used for "today", overdue and touch counts, e.g. `America/New_York`. Default UTC. |
| `SF_PRIMARY_CONTACT_FIELD`, `SF_RESOURCES_FIELD`, `SF_NEWS_TERM_FIELD` | no | Override the custom field API names |

**Quick Access resources** come from two places:

1. Per account, the `Quick_Access_Resources__c` field in Salesforce. The format is in the setup doc.
2. Defaults per Account Type, in `config/resources.ts`. The `"*"` key applies to every account.

Leave a URL empty to show a resource as Pending.

**News (GNews.io free tier).** The free plan allows about 100 requests a day and returns at most 10
articles per request. It's intended for non-commercial or development use, so check gnews.io/pricing
before relying on it. With the 6-hour cache, each account costs at most 4 requests a day. That covers
roughly 25 or more distinct accounts per day on the free plan. If you hit the limit, the panel says so
and the rest of the page is unaffected.

## Deploy to Vercel

1. Push this repo to GitHub, then go to vercel.com → **Add New… → Project** and import the repo. Vercel
   detects Next.js, so no build settings are needed.
2. Add the environment variables above under **Settings → Environment Variables**, for Production (and
   Preview if you want).
3. Deploy. Open `https://<project>.vercel.app/api/health`. It should return `{"ok":true,…}`.
4. Bookmark the root URL. Optionally add a custom domain under **Settings → Domains**.

After that, every push to the main branch redeploys automatically.

Notes:

- **Access.** The app has no login, by choice. Anyone with the URL can read account data and toggle
  primary pins. Pages send `noindex`, but that isn't access control. If that becomes a concern:
  - turn on Vercel **Deployment Protection** (Vercel Authentication or Password Protection for
    production requires a Pro plan), or
  - put it behind your SSO.
- **Plan.** Vercel's Hobby plan is for personal, non-commercial use. An internal company tool belongs
  on **Pro**.
- **Alternatives.** If you'd rather not use Vercel, the app runs unchanged with `npm run build && npm
  start` on Render, Railway, or Fly.io. On those hosts, news caching is per instance instead of shared.
