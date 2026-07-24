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
3. Links every gear reference straight to that gear's page on Strava. We
   don't track or edit anything ourselves; Strava is the only source of
   truth and the only place edits happen. This also means the app works
   for runners and any other gear-logging sport, not just cycling.

## Why Astro + Svelte islands

- Astro handles routing and server-rendering. The OAuth token exchange needs
  a server-side client secret, and Strava API calls should happen
  server-side too (avoids exposing tokens to the browser more than
  necessary) — Astro's SSR (`output: 'server'`, `@astrojs/node` adapter)
  covers this without needing a separate backend.
- Svelte powers the interactive pieces (the sortable/filterable/paginated
  activity table, the unit toggle) as islands (`client:load`), while
  everything else stays static server-rendered HTML.

## Project structure

```
src/
  lib/
    types.ts       Strava API shapes, SessionData, ActivityCacheEntry
    strava.ts       OAuth URL building, token exchange/refresh, API client, fetchAllActivities
    stravaLinks.ts   Pure link builders (e.g. a gear's Strava page) - safe to
                      bundle client-side, unlike strava.ts
    session.ts       Cookie-based session storage (httpOnly cookie, no DB)
    activityCache.ts  Server-side JSON-file cache of one full Strava sync per athlete
    db.ts             Browser-side IndexedDB mirror of the same snapshot -
                       lets the dashboard load instantly on return visits
                       even if the server's cache file is gone
    apiUsage.ts       Daily Strava API call budget (100/day), tracked per athlete
    units.ts          Metric/imperial formatting
    preferences.ts     Cookie-based unit preference
  layouts/
    Base.astro        Shared shell: Bootstrap navbar (unit toggle, call budget, logout)
  pages/
    index.astro         Landing / "Connect with Strava"
    dashboard.astro      Auth + budget/banners only; hands the actual snapshot
                          (or null) to GearDashboard for rendering
    gear/[id].astro       One gear item's cached Strava details + a link to edit it on Strava
    api/
      auth/
        login.ts           Redirects to Strava's OAuth authorize screen
        callback.ts          Exchanges code for tokens, sets session cookie
        logout.ts             Clears session cookie
      strava/
        sync.ts              Fetches everything from Strava, writes the cache,
                              spends the daily call budget - the only route
                              that ever calls Strava
      preferences/
        units.ts                POST to set the metric/imperial cookie
  components/
    GearDashboard.svelte  Resolves which snapshot to show (server-rendered
                           one vs whatever's newer in IndexedDB), persists
                           it back to IndexedDB, renders the gear grid +
                           RideList, and falls back to a one-time sync if
                           there's no data anywhere
    RideList.svelte     Sortable/filterable/paginated activity table, all
                         client-side (plain Svelte component, nested inside
                         GearDashboard - operates entirely on the activity
                         list it's given, no requests)
    UnitToggle.svelte    Metric/imperial toggle (Svelte island)
data/
  strava-cache.json       One cached Strava snapshot per athlete (gitignored;
                            server-side counterpart to the browser's IndexedDB copy)
  api-usage.json           Daily API call counts per athlete (gitignored)
```

## Known limitations (prototype scope)

- **Session storage**: tokens live in a single httpOnly cookie, not a
  database or encrypted session store. Fine for one user testing locally;
  not meant to hold up under multiple users or a public deployment.
- **No local gear editing, by design** — Strava's API has no write endpoint
  for gear at all, and this app deliberately doesn't try to work around
  that with its own local store. Every "edit" affordance links out to the
  gear's actual page on strava.com instead.
- **Activity data can go stale**: both the server cache and the browser's
  IndexedDB copy are snapshots taken at last sync, not live from Strava. An
  activity logged elsewhere won't show up until the user clicks "Refresh
  from Strava". This is intentional (see the daily call budget below), but
  worth knowing.
- **IndexedDB is per-browser**, not per-account — it doesn't sync across
  devices or browsers. Its job is purely to survive the *server's* cache
  disappearing (restart, redeploy on an ephemeral filesystem), not to be a
  second source of truth; the server-side snapshot and daily budget are
  still what `/api/strava/sync` reads and writes.
- **Daily API call budget is a self-imposed governor, not Strava's real
  limit**: 100/day per athlete, tracked in `data/api-usage.json`, resets at
  UTC midnight. It exists purely to discourage clicking Refresh repeatedly;
  Strava's actual app-wide limit (200 req/15min, 2000/day, shared across all
  users of the app) is far higher and unaffected by this.

## Setup

1. Create a Strava API application at
   https://www.strava.com/settings/api (Authorization Callback Domain:
   `localhost`).
2. Copy `.env.example` to `.env` and fill in `STRAVA_CLIENT_ID` /
   `STRAVA_CLIENT_SECRET` from that app.
3. `npm install && npm run dev`, then open http://localhost:4321.
