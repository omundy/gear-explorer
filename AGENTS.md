# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Gear Explorer: a prototype that authenticates against a user's Strava
account and shows their gear (bikes and shoes) and full activity history —
sortable, filterable, paginated, sport-agnostic (cycling and running both
work). It doesn't track or edit anything itself; every gear reference links
out to that gear's actual page on strava.com. See [IDEA.md](IDEA.md) for
the full concept and known limitations, and [CHANGELOG.md](CHANGELOG.md)
for a running log of changes (including the prompts that drove them — keep
appending to it the same way when making further changes).

## Commands

- `npm run dev` — start the dev server (http://localhost:4321)
- `npm run build` — production build to `./dist/`
- `npm run preview` — preview a production build locally
- `npx astro check` — type-check `.astro` files and the project (run this
  after non-trivial changes; there is no separate test suite yet)

Dev server management: `astro dev --background` to start detached (or plain
`npm run dev`); `npx astro dev stop`, `npx astro dev status`, and
`npx astro dev logs` to manage a backgrounded instance. If a change to
`.env` doesn't seem to take effect, stop and restart the dev server —
env vars are only read at startup.

## Setup required before running

Strava OAuth needs real credentials: create an app at
https://www.strava.com/settings/api (Authorization Callback Domain:
`localhost`), then copy `.env.example` to `.env` and fill in
`STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`. Without these, `/api/auth/login`
will 500.

## Architecture

**Rendering mode**: SSR (`output: 'server'` + `@astrojs/vercel` adapter, see
`astro.config.mjs`), not static. This is required — the OAuth token
exchange needs the Strava client secret to stay server-side, and page loads
need to read the session cookie to decide what to render. Deployed on
Vercel; see the "Deploying" section of `IDEA.md` for the actual steps.

**Nothing in this app touches the filesystem.** There is no `data/`
directory and no database. All server-side state is cookies
(`strava_session`, `units`, `api_usage`); all client-side state is
IndexedDB (`src/lib/db.ts`). This is deliberate, not incidental — it's
what makes the app deployable on Vercel's serverless functions, which
have no persistent disk. Don't reach for `node:fs` for anything; if a
future feature needs to remember something server-side across requests,
that's a cookie (small, per-browser) or a real external store (KV/DB) you
add and document, not a JSON file.

**Auth flow**: `src/pages/api/auth/login.ts` redirects to Strava's OAuth
authorize screen → `callback.ts` exchanges the returned code for a session
(`exchangeCodeForTokens` in `src/lib/strava.ts`) → stored as JSON in a
single httpOnly cookie (`src/lib/session.ts`, cookie name `strava_session`,
type `SessionData`), *not* a database. `getValidTokens()` transparently
refreshes and re-persists the cookie when the access token is near expiry —
always call this (not `readTokens()`) from anywhere that needs a valid
session. `SessionData` includes `athleteId`/`firstname`, captured once at
login from the OAuth code-exchange response (Strava only includes the
athlete summary there, not on refresh) — this is how pages know who's
logged in without an extra `GET /athlete` call.

**Strava is called from exactly one place**: `/api/strava/sync`
(`src/pages/api/strava/sync.ts`, `POST`). It fetches the athlete, every
bike/shoe's detail, and every activity (`fetchAllActivities` in
`src/lib/strava.ts`, paging at Strava's max 200/page), records the call
count against the daily budget in `src/lib/apiUsage.ts` (a cookie,
`api_usage`, 100/day, resets at UTC midnight — a self-imposed governor on
refresh-spamming, unrelated to Strava's real app-wide rate limit and
tracked per-browser rather than per-account since it's a cookie), and
returns the whole snapshot as JSON (`{ snapshot, callsUsed }`). **It does
not persist activity data anywhere itself** — no server-side cache
exists. Don't add one back; if a future page needs Strava data, it should
read from IndexedDB (`src/lib/db.ts`) the same way `GearDashboard` does,
not introduce a new `fetchX` call site or a new server-side store.

**All activity data lives in the browser, full stop.** `GearDashboard.svelte`
owns the entire client-side lifecycle: on mount it reads
`src/lib/db.ts` (IndexedDB, keyed by athlete id); if there's nothing
there and the budget allows it, it calls `/api/strava/sync` via `fetch`
(not a navigation), writes the response into IndexedDB, and updates its
own state directly — no page reload anywhere in this flow. The "Refresh
from Strava" button runs the identical `runSync()` function.
`dashboard.astro` itself only handles the auth gate; `GearDashboard` owns
the whole header too (greeting, refresh button, and the live "calls used
today" line, which decrements locally after each sync without a reload) -
it passes no activity data as props at all, just `athleteId`/`firstname`/
`units`/`initialUsageRemaining`/`usageLimit`. A brand-new browser, a
private window, or cleared site data always has to sync once — there's no
server fallback to rescue that case anymore, which is a deliberate trade
for keeping this deployable on a serverless host with no persistent
filesystem.

**No local gear editing, and no page of our own for a piece of gear
either.** There used to be both a local component-tracking feature and a
`/gear/[id]` detail page; both are gone, deliberately. This app doesn't
track, store, or have its own view of anything about gear itself — every
gear reference (dashboard cards, activity table rows) links straight to
that gear's real page on strava.com, built by `stravaGearUrl()` in
`src/lib/stravaLinks.ts` (a dependency-free module, unlike `strava.ts` —
it's imported directly into Svelte client bundles, so keep it free of
server-only imports). Bikes get an individual page
(`strava.com/bikes/{id-without-the-b-prefix}`); shoes don't have
individual pages at all, so every shoe links to the shared
`strava.com/settings/gear`. Don't reintroduce a local write path or
detail page for gear; if a future feature needs local state tied to a
gear id, that's a new, explicitly-scoped decision, not a revival of the
old pattern.

**Islands**: pages (`src/pages/**/*.astro`) read cookies/session and pass
results as props into Svelte islands (`src/components/*.svelte`,
`client:load`) for the interactive parts. `RideList.svelte` is a plain
(non-island) Svelte component nested inside `GearDashboard` - it does
*all* of its pagination/sorting/filtering client-side over the activity
array it's given, no network requests once the data's in memory.
`src/lib/db.ts` uses the browser `indexedDB` global directly, so only
ever call it from `onMount` (or other client-only lifecycle code) in a
Svelte component, never from `.astro` frontmatter or anything that runs
during SSR. Keep new interactive UI in Svelte islands rather than adding
client-side script to `.astro` files.

**API routes** (`src/pages/api/**`) are the only things allowed to mutate
server-side state (session cookie, usage counts) or call Strava. Svelte
islands call these via `fetch`, never the `src/lib` helpers directly
(those only run server-side).
