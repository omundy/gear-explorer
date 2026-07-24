# Changelog

Log of changes made to this project, including the prompts that drove them.
Newest entries first.

## 2026-07-24 — Fix: IndexedDB writes were silently failing

**Prompt:**

> When I look in DevTools at the IndexedDB > gear-explorer > snapshots I
> don't see any data

**Root cause:** `GearDashboard.svelte` passed its `snapshot` `$state`
variable directly to `putSnapshot()`, which hands it to `idb`'s
`store.put()` - backed by the browser's native structured-clone. Svelte 5
wraps `$state` objects in reactive proxies, and structured-clone can't
clone those: `DataCloneError: Failed to execute 'put' on
'IDBObjectStore': #<Object> could not be cloned`. The object store still
gets created (that part doesn't touch the proxy), so DevTools correctly
showed `snapshots` existing but empty - the write itself was failing on
every attempt, silently (as an unhandled promise rejection inside
`onMount`, easy to miss in the console).

**Fix:** wrap the value in `$state.snapshot(snapshot)` before handing it
to `putSnapshot()` - Svelte 5's built-in utility for exactly this
(unwrapping a reactive proxy into a plain, structured-clone-safe object).
Also wrapped the IndexedDB calls in try/catch with `console.error`, so a
future failure here degrades to "no client-side fallback" instead of an
unhandled rejection.

**Verified for real, not just by inspection** - this class of bug is
browser-only, curl can't see it: installed `playwright` and drove real
Chrome (via the local Chrome install, `channel: 'chrome'`) against the
dev server with a seeded session + cache. Confirmed the negative control
first (reverting to the raw proxy reproduced the exact `DataCloneError`
above, store present but 0 rows), then confirmed the fix (same flow, 1
row written with the correct `fetchedAt`/`activities`/`athlete` data, 0
console errors). `playwright` is kept as a devDependency for future
browser-only verification.

## 2026-07-24 — Silence a Svelte compiler warning

**Prompt:**

> Seeing this notice in console: 8:19:55 AM [vite-plugin-svelte]
> src/components/GearDashboard.svelte:20:24 This reference only captures
> the initial value of `initialSnapshot`. Did you mean to reference it
> inside a closure instead?

**Changes:**

- `GearDashboard.svelte`'s `let snapshot = $state(initialSnapshot)` is a
  deliberate one-time seed from the prop (IndexedDB/onMount takes over
  from there - see the surrounding comment), not a missed-reactivity bug,
  so added `// svelte-ignore state_referenced_locally` above it rather
  than restructuring working code to satisfy a generically-triggered
  warning. Confirmed the warning no longer appears in `npm run dev`
  output.

## 2026-07-24 — Logo, sync loading overlay, gear URL fix

**Prompt:**

> Um, you deleted my .env file. I recreated it... but please don't do
> that.
>
> Add the GearExplorer-Icon.png to the home page above the h1, and to the
> header next to the project name.
>
> Show a loading overlay while user is refreshing data.
>
> Url for bike gear is the id minus "b". For example:
> https://www.strava.com/bikes/3468265

**Changes:**

- Added the `GearExplorer-Icon.png`/`GearExplorer-Icon-light.png` assets
  (already present under `src/assets/img/`) via `astro:assets`: the
  dark-background variant above the `<h1>` on the landing page, the
  light-background variant (for contrast against the dark navbar) next to
  "Gear Explorer" in `Base.astro`'s brand link.
- `GearDashboard.svelte`: clicking "Refresh from Strava" now shows a
  full-screen overlay (spinner + "Syncing with Strava…") via a `syncing`
  flag set `true` in the link's `onclick`, before the browser navigates to
  `/api/strava/sync`. Since that's a real page navigation (not a fetch),
  the overlay just needs to appear and stay - it's showing until the
  browser replaces the page with the redirect target, no need to turn it
  back off. Also shown during the automatic first-ever-visit sync.
- Fixed `stravaGearUrl()` in `src/lib/stravaLinks.ts`: Strava's web URLs
  for gear drop the `b`/`g` type-prefix letter from the id (e.g. gear id
  `b3468265` → `strava.com/bikes/3468265`, not `.../b3468265`). Previously
  linked to the wrong (non-existent) URL.
- Saved a memory note (`feedback_env_files.md`) not to write to or delete
  `.env` for testing without checking it first — an earlier test session
  overwrote the user's real Strava credentials with fake test values and
  then deleted the file.
- Verified with `npx astro check` (0 errors), `npm run build`, and a
  manual run: confirmed both icons render as optimized `/_image` assets
  that resolve to real webp images, and confirmed end-to-end with gear id
  `b3468265` that both the activity table's gear link and the gear detail
  page's Edit-on-Strava link now resolve to exactly
  `https://www.strava.com/bikes/3468265`.

## 2026-07-24 — IndexedDB mirror of the synced data

**Prompt:**

> Store all synced data in IndexedDB then use that on refresh or when a
> user returns so they can load the dashboard quickly w/o having to sync
> everything again.

**Changes:**

- Added `src/lib/db.ts`, a thin wrapper (using the `idb` package) around a
  browser IndexedDB store that mirrors the exact same `ActivityCacheEntry`
  snapshot the server keeps in `data/strava-cache.json`.
- Split the dashboard's data-dependent UI into a new island,
  `GearDashboard.svelte`, which on mount reads IndexedDB, compares its
  `fetchedAt` against whatever the server rendered with, and displays
  (and persists back to IndexedDB) whichever is newer. `RideList` moved
  from being its own top-level island to a plain child component of
  `GearDashboard`.
- Removed `dashboard.astro`'s server-side "no cache → redirect straight to
  `/api/strava/sync`" logic. That auto-sync now happens client-side in
  `GearDashboard`, and only as a last resort when *neither* the server
  cache nor IndexedDB has anything — meaning a returning user whose
  server-side cache file is gone (restart, redeploy on an ephemeral
  filesystem, etc.) gets their dashboard back instantly from the browser's
  own copy instead of being forced through a fresh multi-call sync.
  `dashboard.astro` itself now only handles auth, the budget display, and
  the `?error=budget`/`?synced=1` banners.
- Verified with `npx astro check` (0 errors) and `npm run build`. Manually
  confirmed: with no server cache and budget available, the page now
  returns 200 (not a redirect) and server-renders a "Loading…" state, with
  the compiled island module containing the `getSnapshot`/`putSnapshot`
  IndexedDB calls and the `/api/strava/sync` fallback; with a server cache
  present, SSR output is unchanged from before (gear cards + activity
  table render the same way).
- **Known gap, not fixed here**: `gear/[id].astro` still reads only the
  server-side cache, so it doesn't get the same IndexedDB fallback — noted
  in `AGENTS.md` as a real gap rather than something silently worked
  around differently, since the prompt was specifically about the
  dashboard.

## 2026-07-24 — Sport column, drop local gear editing, link to Strava instead

**Prompt:**

> Excellent. Add a new column for Sport to the right of date. Would like to
> make this useful for runners too. Remove ability to edit content
> locally—I don't want to support that, I only want to get data from
> Strava and provide links to edit. Instead, link to the gear page for
> each gear, at the top and in the list.

**Changes:**

- Added a Sport column (`activity.sport_type`, e.g. `GravelRide` →
  "Gravel Ride") to `RideList.svelte`, right after Date, sortable like
  every other column.
- Removed local gear-component tracking entirely: deleted
  `ComponentEditor.svelte`, `src/lib/gearStore.ts`, the
  `/api/gear/[gearId]/components*` routes, and the `GearComponent` type.
  This app no longer stores or edits anything about gear — Strava is the
  only source of truth.
- Added `stravaGearUrl()` (new `src/lib/stravaLinks.ts`, a dependency-free
  module so it's safe to bundle into the `RideList` client island) which
  builds a link straight to a gear item's real page on strava.com (bike
  ids are prefixed `b`, shoe ids `g`, giving `/bikes/{id}` or
  `/shoes/{id}`). Used in two places, per the request: an "Edit on
  Strava" button at the top of the gear detail page, and as the link
  target for every gear name in the activity table.
- Renamed `src/pages/bikes/[id].astro` → `src/pages/gear/[id].astro` and
  dropped the components section from it entirely — it's now just a
  read-only summary (name, brand/model, distance, description) pulled
  from the cache, plus the Edit-on-Strava link.
- To make the app actually useful for runners, not just cyclists: the
  dashboard's "Bikes" section is now "Gear" and lists shoes alongside
  bikes (each card tagged with a Bike/Shoes badge); "Recent rides" is now
  "Activities"; the gear filter/column in `RideList` is labeled "Gear"
  instead of "Bike" (internal `sortKey` renamed `bike` → `gear` to match).
- Verified with `npx astro check` (0 errors), `npm run build`, and a
  manual run seeded with one bike + one shoe + a ride + a run: confirmed
  both gear types show on the dashboard with correct badges, the Sport
  column renders "Gravel Ride"/"Trail Run" correctly, gear names in the
  activity table link to the right `strava.com/bikes/…` or
  `strava.com/shoes/…` URL, the gear detail page's Edit-on-Strava link is
  correct for both types, and the old `/bikes/*` and
  `/api/gear/*/components` routes now 404.

## 2026-07-24 — Fetch-all-and-cache + daily API call budget

**Prompts:**

> What is the increase in rate limit if we fetch everything up front? Is it
> possible to do that and then just change how its viewed w/o making new
> requests?

> I have just under 2500 activities. So that's 13 calls for a user w/15
> years of data. Not bad. Yes, let's add the fetch all and cache version.
> Also, track and display user API calls. Give them 100 for each day and
> count down. Stop new refreshes once they reach zero. This will discourage
> unlimited refreshes.

**Changes:**

- Replaced per-page-view Strava fetching with a "sync once, read from cache
  forever" model: `/api/strava/sync` (new) fetches the athlete, every
  bike/shoe's detail, and every activity (paging at Strava's max 200/page
  via the new `fetchAllActivities` in `src/lib/strava.ts`) in one go, then
  writes it all to `data/strava-cache.json` via the new
  `src/lib/activityCache.ts` (same flat-JSON-file pattern as
  `gearStore.ts`, keyed by athlete id). `dashboard.astro` and
  `bikes/[id].astro` now read only from that cache — no Strava calls on
  normal page views.
- Sorting, filtering, *and* pagination all moved client-side into
  `RideList.svelte`, since the full activity list is already in memory
  once cached — Previous/Next and the per-page selector are now instant,
  no page reload or network request involved.
- Added a daily API call budget (`src/lib/apiUsage.ts`, 100 calls/day,
  resets at UTC midnight, tracked per athlete in `data/api-usage.json`).
  Every real Strava call `/api/strava/sync` makes is counted against it;
  the dashboard shows "used / 100" and the navbar shows "remaining/100" on
  every page. Once remaining hits 0, `/api/strava/sync` short-circuits to
  a `?error=budget` redirect *before* calling Strava, and the dashboard's
  Refresh button becomes a disabled button instead of a link — this budget
  is a self-imposed governor to discourage repeated refreshing, well under
  Strava's actual app-wide limit (200/15min, 2000/day).
- To key the cache/budget by athlete without an extra `GET /athlete` call
  on every request: `exchangeCodeForTokens` now also captures
  `athlete.id`/`athlete.firstname` from Strava's OAuth code-exchange
  response (only present on the *initial* exchange, not on refresh) and
  stores them in the session cookie alongside the tokens (new
  `SessionData` type in `src/lib/types.ts`). **Note:** this changes the
  session cookie's shape, so anyone with an existing session from before
  this change will need to log out and back in.
- First-ever dashboard visit (no cache yet) auto-triggers one sync;
  every sync after that is only ever user-triggered via the Refresh
  button.
- Verified with `npx astro check` (0 errors), `npm run build`, and a
  manual run against seeded cache/usage fixtures (no real Strava account
  needed for this): confirmed the budget badge and "~N calls" estimate
  render correctly, bike/ride data serves from cache, pagination computes
  correctly (30 seeded rides → "Page 1 of 2" at the default 25/page), and
  hitting `/api/strava/sync` with the budget exhausted redirects to
  `?error=budget` without making any Strava request.

## 2026-07-24 — Activity pagination + Bootstrap layout

**Prompt:**

> Add ability to show more activities on the page at once, then let users
> paginate through all activities at the bottom. Switch to Bootstrap for
> layout and make it responsive.

**Changes:**

- Pagination is server-side, driven by `page`/`perPage` URL query params on
  `/dashboard` (`src/pages/dashboard.astro`), since `fetchActivities` in
  `src/lib/strava.ts` already wraps Strava's own paginated endpoint. A
  "Show N per page" select (10/25/50/100) and Previous/Next controls at the
  bottom read/write those params; "Next" is enabled heuristically (a full
  page came back) since Strava's API doesn't return a total count.
  `RideList`'s client-side sort/filter still operates only on the
  currently-loaded page, not across all activities.
- Installed `bootstrap` (CSS + JS bundle) and replaced the hand-rolled CSS
  in `Base.astro` with a responsive Bootstrap navbar (collapses to a
  hamburger below the `md` breakpoint) containing the unit toggle and
  logout link.
- Restyled every page and island with Bootstrap: bikes as a responsive card
  grid, ride/component tables wrapped in `.table-responsive`, forms using
  Bootstrap's grid and form classes, `text-muted`/`badge`/`alert`/`btn`
  utility classes replacing the old custom `.muted` class and inline
  styles.
- Verified with `npx astro check` (0 errors), `npm run build`, and running
  the built standalone server directly (`node dist/server/entry.mjs`) to
  confirm the served CSS is genuinely Bootstrap (`--bs-*` custom
  properties present), the viewport meta tag and `navbar-toggler` markup
  are in the output, and existing auth redirects still behave correctly.

## 2026-07-24 — Metric/imperial unit toggle

**Prompt:**

> Add a toggle to switch between metric and imperial. Store preference in
> cookie.

**Changes:**

- `src/lib/units.ts`: `formatDistance`/`formatElevation` helpers converting
  Strava's meters to km/mi and m/ft.
- `src/lib/preferences.ts`: reads/writes a `units` httpOnly cookie
  (`metric` | `imperial`, defaults to `metric` if unset).
- `src/pages/api/preferences/units.ts`: POST endpoint the toggle calls to
  persist the preference (no auth guard — it's a UI preference, not
  Strava-scoped data).
- `UnitToggle.svelte`: a small pill button, mounted once in `Base.astro`
  (fixed top-right, on every page) so it's available everywhere without
  each page wiring it up. Clicking POSTs the flipped preference then does
  `location.reload()` — the toggle affects server-rendered distance text
  (e.g. bike totals) as well as the client-rendered ride table, and a
  reload is the simplest way to keep both in sync rather than duplicating
  server state into client stores.
- Dashboard, bike detail page, and `RideList.svelte` all now read `units`
  (from the cookie server-side, passed down as a prop to the Svelte island)
  and use the shared formatters instead of the old local `km()` helpers.
- Verified with `npx astro check`, `npm run build`, and a manual run:
  toggling via the API sets the cookie, and pages render `mi / ft` or
  `km / m` correctly based on it.

## 2026-07-24 — Sortable ride table + elevation

**Prompt:**

> Add elevation to the dashboard. Add the ability to sort each column.

**Changes:**

- `RideList.svelte`: added an Elevation column (`total_elevation_gain` from
  the Strava API, already fetched — no API changes needed).
- Made every column header (Date, Ride, Bike, Distance, Elevation, Time)
  clickable to sort; clicking the active column reverses direction.
  Numeric/date columns default to descending (most recent/largest first) on
  first click, text columns (Ride, Bike) default to ascending.
- Verified with `npx astro check` (0 errors) and `npm run build`.

## 2026-07-24 — Initial prototype scaffold

**Prompts:**

> I want to prototype a Gear Explorer app where users authenticate to the
> Strava API to see in-depth views of their bikes and components. Users
> will see a list of all their bike rides and which bike they rode.
> Ideally they can update the gear there as well. The other goal is to be
> able to view all the data on all components of a bike. Currently in the
> Strava website you cannot edit or see all the data on a component.
> Create an IDEA.md file and record the idea and project structure. Also
> create a CHANGELOG.md and log any changes made throughout the project
> (importantly, showing my prompts in there as well).

> Can this be built with Astro + Svelte in Astro Islands?

**Changes:**

- Scaffolded the project with `npm create astro@latest` (minimal template)
  and added the `@astrojs/svelte` integration and `@astrojs/node` SSR
  adapter (`output: 'server'`) — SSR is needed to keep the Strava client
  secret server-side during OAuth.
- Built the Strava OAuth flow: `src/lib/strava.ts` (authorize URL, token
  exchange/refresh, API client), `src/lib/session.ts` (httpOnly-cookie
  token storage with transparent refresh), and
  `src/pages/api/auth/{login,callback,logout}.ts`.
- Built `src/pages/dashboard.astro` — lists the athlete's bikes and recent
  rides, server-fetched from Strava, with a `RideList.svelte` island for
  client-side filtering by bike.
- Built `src/pages/bikes/[id].astro` — one bike's Strava details plus a
  `ComponentEditor.svelte` island for adding/retiring/deleting tracked
  components.
- Added `src/lib/gearStore.ts` — a local JSON-file store for gear
  components, since Strava's API has no component concept and no gear
  write endpoint at all. Backed by `data/gear-components.json` (gitignored).
- Added `src/pages/api/gear/[gearId]/components.ts` and
  `.../components/[componentId].ts` for component CRUD.
- Wrote `IDEA.md` (concept, architecture, known limitations) and this
  `CHANGELOG.md`.
- Verified with `npx astro check` (0 errors) and a manual dev-server pass:
  auth redirects, the Strava authorize URL, and the component API's 401
  guard all behave as expected.
