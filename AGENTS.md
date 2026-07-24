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

**Rendering mode**: SSR (`output: 'server'` + `@astrojs/node` adapter, see
`astro.config.mjs`), not static. This is required — the OAuth token
exchange needs the Strava client secret to stay server-side, and page loads
need to read the session cookie to decide what to render.

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
(`src/pages/api/strava/sync.ts`). It fetches the athlete, every bike/shoe's
detail, and every activity (`fetchAllActivities` in `src/lib/strava.ts`,
paging at Strava's max 200/page), then writes the whole snapshot to
`data/strava-cache.json` via `src/lib/activityCache.ts` (keyed by athlete
id) and records the call count against that athlete's daily budget in
`src/lib/apiUsage.ts` (`data/api-usage.json`, 100/day, resets at UTC
midnight — a self-imposed governor on refresh-spamming, unrelated to
Strava's real app-wide rate limit). `gear/[id].astro` reads Strava data
*only* from that server-side cache — never calls Strava directly. If
you're adding a page that needs Strava data, read it from
`activityCache.ts`, don't add a new `fetchX` call site.

**Dashboard data flow has two cache layers, not one.** `dashboard.astro`
reads the server-side cache (may be `null`) and passes it as
`initialSnapshot` to the `GearDashboard` island - it no longer
auto-redirects to sync just because that's empty. `GearDashboard.svelte`
then checks `src/lib/db.ts` (a browser IndexedDB mirror of the same
`ActivityCacheEntry` shape) on mount and prefers whichever copy is newer
by `fetchedAt`, persisting the winner back to IndexedDB. This is what lets
a returning user's dashboard render instantly even if the server's cache
file is gone (restart, ephemeral deploy filesystem) - the browser's copy
covers for it. Only when *neither* the server nor IndexedDB has anything
does it fall back to `location.href = '/api/strava/sync'`, once. If you
add another page that shows cached Strava data, follow the same pattern
(resolve server vs IndexedDB client-side) rather than trusting the
server-side cache alone - right now `gear/[id].astro` does *not* do this
and will show "no synced data" if the server cache is gone even though
the browser might have it, which is a known gap, not an oversight to
silently work around differently.

**No local gear editing.** There used to be a local component-tracking
feature; it's gone, deliberately — this app doesn't track or store
anything about gear itself, only reads Strava's cache. Every "edit"
affordance is a link to that gear's real page on strava.com, built by
`stravaGearUrl()` in `src/lib/stravaLinks.ts` (a dependency-free module,
unlike `strava.ts` — it's imported directly into the `RideList.svelte`
client bundle, so keep it free of server-only imports). Don't reintroduce
a local write path for gear data; if a future feature needs local state
tied to a gear id, that's a new, explicitly-scoped decision, not a revival
of the old pattern.

**Islands**: pages (`src/pages/**/*.astro`) read from the cache/cookies and
pass results as props into Svelte islands (`src/components/*.svelte`,
`client:load`) for the interactive parts. `RideList.svelte` is a plain
(non-island) Svelte component nested inside `GearDashboard` - it does
*all* of its pagination/sorting/filtering client-side over the activity
array it's given, no network requests, since the point of both cache
layers is to make browsing free. `src/lib/db.ts` uses the browser
`indexedDB` global directly, so only ever call it from `onMount` (or other
client-only lifecycle code) in a Svelte component, never from `.astro`
frontmatter or anything that runs during SSR. Keep new interactive UI in
Svelte islands rather than adding client-side script to `.astro` files.

**API routes** (`src/pages/api/**`) are the only things allowed to mutate
state (session cookie, the Strava cache, or usage counts). Svelte islands
call these via `fetch`, never the `src/lib` helpers directly (those only
run server-side).
