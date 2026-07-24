# Gear Explorer

## The idea

Strava tracks which bike (or pair of shoes) you used on every activity, and
it tracks that gear's total lifetime distance — but its own site buries
this: no per-sport breakdown, no sortable/filterable activity list, no way
to jump straight from an activity to the gear that was on it.

Gear Explorer is a prototype that:

1. Authenticates against a user's Strava account via OAuth.
2. Lists their gear (bikes and shoes) and their full activity history —
   sport, distance, elevation, time, and which piece of gear was used —
   sortable, filterable, and paginated, all client-side once synced.
3. Links every gear reference straight to that gear's page on Strava (a
   bike's own page, or `strava.com/settings/gear` for shoes, which don't
   get individual pages). We don't track or edit anything ourselves, and
   don't have our own page for a piece of gear either - Strava is the only
   source of truth and the only place edits happen. This also means the
   app works for runners and any other gear-logging sport, not just
   cycling.
4. Charts distance-per-period against time as one line per gear (year or
   month, toggleable) - the "which bike was I actually riding, and when did
   I switch" story that's otherwise buried across hundreds of individual
   activity rows.

## Why Astro + Svelte islands

- Astro handles routing and server-rendering. The OAuth token exchange needs
  a server-side client secret, and Strava API calls should happen
  server-side too (avoids exposing tokens to the browser more than
  necessary) — Astro's SSR (`output: 'server'`, `@astrojs/vercel` adapter)
  covers this without needing a separate backend.
- Svelte powers the interactive pieces (the sortable/filterable/paginated
  activity table, the unit toggle) as islands (`client:load`), while
  everything else stays static server-rendered HTML.
- Nothing in the app touches the filesystem (activity data lives in the
  browser's IndexedDB, the daily call budget lives in a cookie), which is
  what makes it deployable as-is on a serverless host with no persistent
  disk, like Vercel.

## Project structure

```
src/
  lib/
    types.ts       Strava API shapes, SessionData, ActivityCacheEntry
    strava.ts       OAuth URL building, token exchange/refresh, API client, fetchAllActivities
    stravaLinks.ts   Pure link builders (e.g. a gear's Strava page) - safe to
                      bundle client-side, unlike strava.ts
    session.ts       Cookie-based session storage (httpOnly cookie, no DB)
    db.ts             The only place a synced snapshot is stored, period -
                       a browser IndexedDB wrapper. No server-side copy exists.
    apiUsage.ts       Daily Strava API call budget (100/day), tracked in a
                       cookie - no server-side storage at all, which is what
                       makes this deployable on a serverless host
    units.ts          Metric/imperial formatting
    preferences.ts     Cookie-based unit preference
  layouts/
    Base.astro        Shared shell: Bootstrap navbar (dashboard link, unit
                       toggle, logout) + a footer linking to /privacy
  pages/
    index.astro         Landing: "Connect with Strava", or "View Dashboard"
                          (plain link) if already signed in - doesn't
                          auto-redirect
    dashboard.astro      Just the auth gate; everything else (including the
                          "Hi, {name}" header and the live budget display)
                          lives in GearDashboard
    privacy.astro         What's stored where, and that it's all client-side
                          except the session cookie and the budget cookie
    api/
      auth/
        login.ts           Redirects to Strava's OAuth authorize screen
        callback.ts          Exchanges code for tokens, sets session cookie
        logout.ts             Clears session cookie
      strava/
        sync.ts              POST: fetches everything from Strava and
                              returns it as JSON - the only route that ever
                              calls Strava, and the only thing that spends
                              the daily call budget. Doesn't persist
                              anything server-side; the caller does that.
      preferences/
        units.ts                POST to set the metric/imperial cookie
  components/
    GearDashboard.svelte  Owns the whole client-side data lifecycle: reads
                           IndexedDB on mount, calls /api/strava/sync (via
                           fetch, not navigation) when there's nothing
                           there yet or the user clicks Refresh, writes the
                           result back to IndexedDB, and renders the gear
                           grid + timeline chart + RideList from whatever
                           it currently has
    GearTimeline.svelte   Chart.js line chart, one line per gear, distance
                           per year or month (toggle) - all client-side,
                           nested inside GearDashboard like RideList
    RideList.svelte     Sortable/filterable/paginated activity table, all
                         client-side (plain Svelte component, nested inside
                         GearDashboard - operates entirely on the activity
                         list it's given, no requests)
    UnitToggle.svelte    Metric/imperial toggle (Svelte island)
```

There is no `data/` directory - the app has no filesystem dependency at all.
All state is either in the browser (IndexedDB, unit preference cookie) or
in cookies read/written per-request (session, daily call budget).

## Known limitations (prototype scope)

- **Session storage**: tokens live in a single httpOnly cookie, not a
  database or encrypted session store. Fine for one user testing locally;
  not meant to hold up under multiple users or a public deployment.
- **No local gear editing, and no page of our own for a piece of gear
  either** — Strava's API has no write endpoint for gear at all, so this
  app doesn't try to work around that with a local store or a local detail
  page. Every gear reference links straight to the gear's actual page on
  strava.com (or `/settings/gear` for shoes, which don't have individual
  pages).
- **Activity data lives only in the browser (IndexedDB) and can go stale**:
  it's a snapshot from the last sync, not live from Strava. A brand-new
  browser, a private/incognito window, or cleared site data has nothing to
  show until it syncs. An activity logged elsewhere won't show up until
  the user clicks "Refresh from Strava". Both are intentional trade-offs
  (see the daily call budget below), not bugs.
- **Daily API call budget is a self-imposed governor, not Strava's real
  limit, and it's tracked per browser, not per account**: 100/day, kept in
  a cookie (`api_usage`), resets at UTC midnight. It exists purely to
  discourage clicking Refresh repeatedly; Strava's actual app-wide limit
  (200 req/15min, 2000/day, shared across all users of the app) is far
  higher and unaffected by this. Because it's a cookie, it's trivially
  resettable by clearing cookies or switching browsers, and it doesn't
  follow the same person across devices - both fine for a personal-use
  governor, not fine if this ever needed to be a real enforced limit.
- **The usage timeline caps at 8 gear lines** (a validated categorical
  palette's limit for staying colorblind-distinguishable - see
  `src/lib/chartColors.ts`); anyone with more gear than that sees their top
  8 by lifetime distance as named lines and everything else folded into a
  single "Other gear" line, rather than a 9th generated hue. The chart is
  light-mode only, matching the rest of the app (no dark mode anywhere yet).

## Setup

1. Create a Strava API application at
   https://www.strava.com/settings/api (Authorization Callback Domain:
   `localhost` for local dev).
2. Copy `.env.example` to `.env` and fill in `STRAVA_CLIENT_ID` /
   `STRAVA_CLIENT_SECRET` from that app.
3. `npm install && npm run dev`, then open http://localhost:4321.

## Deploying (Vercel)

The app has zero filesystem dependency, so it deploys to Vercel as-is:

1. Push this repo to GitHub (or GitLab/Bitbucket) and import it in Vercel,
   or run `npx vercel` from this directory to deploy straight from the CLI.
   Vercel auto-detects Astro + the `@astrojs/vercel` adapter; no extra
   config needed.
2. In the Vercel project's Settings → Environment Variables, add
   `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` (same values as your local
   `.env`).
3. Once deployed, update the Strava API app's Authorization Callback
   Domain to match the Vercel deployment's domain (e.g.
   `gear-explorer.vercel.app`, or a custom domain) - it only accepts one
   domain at a time, so switching between local dev and production means
   switching this setting (or keeping a second Strava API app for local
   dev).
