<script lang="ts">
  import { onMount } from 'svelte';
  import type { ActivityCacheEntry, Units } from '../lib/types';
  import { getSnapshot, putSnapshot } from '../lib/db';
  import { formatDistance } from '../lib/units';
  import RideList from './RideList.svelte';

  interface Props {
    athleteId: number;
    units: Units;
    initialSnapshot: ActivityCacheEntry | null;
    usageRemaining: number;
  }
  const { athleteId, units, initialSnapshot, usageRemaining }: Props = $props();

  // Whatever the server rendered with (possibly nothing, if its cache file
  // is gone) is the starting point; onMount below may replace it with a
  // newer copy from IndexedDB, which is what makes return visits fast even
  // when the server has nothing to serve. Deliberately a one-time seed, not
  // a live binding - initialSnapshot never changes after mount (Astro
  // islands aren't re-invoked with new props client-side), so there's
  // nothing for a closure to re-read.
  // svelte-ignore state_referenced_locally
  let snapshot = $state(initialSnapshot);
  let checkedBrowserCache = $state(false);
  // The actual sync is a full-page navigation to /api/strava/sync (a plain
  // link/redirect, not a fetch - see the Refresh button below), so this
  // just needs to flip on before the browser leaves the page and stay on
  // until it does; no need to ever set it back to false.
  let syncing = $state(false);

  onMount(async () => {
    try {
      const cached = await getSnapshot(athleteId);
      if (cached && (!snapshot || cached.fetchedAt > snapshot.fetchedAt)) {
        snapshot = cached;
      }
      if (snapshot && (!cached || cached.fetchedAt !== snapshot.fetchedAt)) {
        // snapshot is a $state proxy; IndexedDB's put() uses the browser's
        // native structured-clone, which doesn't reliably handle Svelte's
        // reactive proxies (fails silently rather than throwing in some
        // cases) - $state.snapshot() unwraps it to a plain, clonable object.
        await putSnapshot(athleteId, $state.snapshot(snapshot));
      }
    } catch (err) {
      // IndexedDB being unavailable/broken shouldn't break the dashboard -
      // it just means no client-side fallback next time. Log so it's not
      // silently invisible during debugging.
      console.error('IndexedDB snapshot sync failed:', err);
    }
    checkedBrowserCache = true;

    if (!snapshot && usageRemaining > 0) {
      // Nothing in IndexedDB and nothing from the server: this is a
      // brand-new browser/athlete with no data anywhere, so there's
      // nothing to fall back to - do the one-time initial sync.
      syncing = true;
      location.href = '/api/strava/sync';
    }
  });

  const allGear = $derived(snapshot ? [...snapshot.athlete.bikes, ...snapshot.athlete.shoes] : []);
  const gearNames = $derived(Object.fromEntries(allGear.map((g) => [g.id, g.name])));
  const estimatedSyncCalls = $derived(
    snapshot ? 1 + Object.keys(snapshot.gearDetails).length + Math.ceil(snapshot.activities.length / 200) : null,
  );
</script>

{#if syncing}
  <div
    class="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center gap-3"
    style="background: rgba(0, 0, 0, 0.6); z-index: 1055;"
  >
    <div class="spinner-border text-light" role="status">
      <span class="visually-hidden">Syncing…</span>
    </div>
    <div class="text-light">Syncing with Strava…</div>
  </div>
{/if}

{#if !snapshot}
  <p class="text-muted">
    {checkedBrowserCache
      ? 'No data yet, and no Strava API calls remaining today. Check back tomorrow to sync.'
      : 'Loading…'}
  </p>
{:else}
  <div>
    <div class="small text-muted mb-3">Last synced {new Date(snapshot.fetchedAt).toLocaleString()}</div>

    <div class="d-flex justify-content-between align-items-center mb-2">
      <h2 class="h5 mb-0">Gear</h2>
      {#if usageRemaining > 0}
        <a class="btn btn-outline-secondary btn-sm" href="/api/strava/sync" onclick={() => (syncing = true)}>
          Refresh from Strava{estimatedSyncCalls ? ` (~${estimatedSyncCalls} calls)` : ''}
        </a>
      {:else}
        <button type="button" class="btn btn-outline-secondary btn-sm" disabled>
          Refresh from Strava (0 calls left today)
        </button>
      {/if}
    </div>

    {#if allGear.length === 0}
      <p class="text-muted">No gear on this Strava account.</p>
    {:else}
      <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3 mb-5">
        {#each allGear as gear (gear.id)}
          <div class="col">
            <a href={`/gear/${gear.id}`} class="card text-decoration-none h-100">
              <div class="card-body">
                <span class="badge text-bg-secondary mb-1">{gear.id.startsWith('b') ? 'Bike' : 'Shoes'}</span>
                <h3 class="h6 card-title mb-1">{gear.name}</h3>
                <p class="card-text text-muted small mb-0">{formatDistance(gear.distance, units, 0)} total</p>
              </div>
            </a>
          </div>
        {/each}
      </div>
    {/if}

    <h2 class="h5 mb-3">Activities</h2>
    <RideList activities={snapshot.activities} gearNames={gearNames} units={units} />
  </div>
{/if}
