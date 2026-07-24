<script lang="ts">
  import { onMount } from "svelte";
  import type { ActivityCacheEntry } from "../lib/types";
  import type { Units } from "../lib/units";
  import { getSnapshot, putSnapshot } from "../lib/db";
  import { formatDistance } from "../lib/units";
  import { stravaGearUrl } from "../lib/stravaLinks";
  import RideList from "./RideList.svelte";
  import GearTimeline from "./GearTimeline.svelte";

  interface Props {
    athleteId: number;
    firstname: string;
    units: Units;
    initialUsageRemaining: number;
    usageLimit: number;
  }
  const { athleteId, firstname, units, initialUsageRemaining, usageLimit }: Props = $props();

  // There's no server-side copy of activity data at all - IndexedDB is the
  // only place it lives, so this always starts empty and onMount below
  // fills it in from there (or triggers a sync if IndexedDB has nothing
  // either).
  let snapshot = $state<ActivityCacheEntry | null>(null);
  let checkedBrowserCache = $state(false);
  let syncing = $state(false);
  let syncError = $state("");
  // Seeded from the page-load budget, then adjusted locally after each
  // sync so both the Refresh button and the usage line stay correct
  // within a visit without needing a page reload.
  let remaining = $state(initialUsageRemaining);
  const used = $derived(usageLimit - remaining);

  async function runSync() {
    syncing = true;
    syncError = "";
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      if (res.status === 401) {
        location.href = "/";
        return;
      }
      if (res.status === 429) {
        syncError =
          "You've used all your Strava API calls for today. Try again tomorrow.";
        return;
      }
      if (!res.ok) {
        syncError = `Sync failed (${res.status}). Please try again.`;
        return;
      }
      const { snapshot: fresh, callsUsed } = await res.json();
      snapshot = fresh;
      remaining = Math.max(0, remaining - callsUsed);
      try {
        await putSnapshot(athleteId, fresh);
      } catch (err) {
        console.error("IndexedDB snapshot write failed:", err);
      }
    } catch (err) {
      console.error("Sync request failed:", err);
      syncError = "Sync failed. Please try again.";
    } finally {
      syncing = false;
    }
  }

  onMount(async () => {
    try {
      const cached = await getSnapshot(athleteId);
      if (cached) snapshot = cached;
    } catch (err) {
      console.error("IndexedDB read failed:", err);
    }
    checkedBrowserCache = true;

    if (!snapshot && remaining > 0) {
      // Nothing in IndexedDB: brand-new browser/athlete with no data
      // anywhere, so there's nothing to fall back to - do the one-time
      // initial sync.
      await runSync();
    }
  });

  const allGear = $derived(
    snapshot ? [...snapshot.athlete.bikes, ...snapshot.athlete.shoes] : [],
  );
  const gearNames = $derived(
    Object.fromEntries(allGear.map((g) => [g.id, g.name])),
  );
  const estimatedSyncCalls = $derived(
    snapshot
      ? 1 +
          Object.keys(snapshot.gearDetails).length +
          Math.ceil(snapshot.activities.length / 200)
      : null,
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

<div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
  <h1 class="h3 mb-0">Hi, {firstname}</h1>
  <div class="text-end">
   {#if snapshot}
   <span class="small text-muted mt-1">
        Last synced {new Date(snapshot.fetchedAt).toLocaleString()}
   </span>
        {/if}
    {#if remaining > 0}
      <button type="button" class="btn btn-outline-secondary btn-sm" onclick={runSync}>
        Refresh from Strava{estimatedSyncCalls ? ` (~${estimatedSyncCalls} calls)` : ""}
      </button>
    {:else}
      <button type="button" class="btn btn-outline-secondary btn-sm" disabled>
        Refresh from Strava (0 calls left today)
      </button>
    {/if}
    <div class="small text-muted mt-1">
        Strava API calls today: {used}/{usageLimit} 
      </div>
  </div>
</div>

{#if syncError}
  <div class="alert alert-danger" role="alert">{syncError}</div>
{/if}

{#if !snapshot}
  <p class="text-muted">
    {checkedBrowserCache
      ? "No data yet, and no Strava API calls remaining today. Check back tomorrow to sync."
      : "Loading…"}
  </p>
{:else}
  <div>
    <GearTimeline activities={snapshot.activities} gear={allGear} {units} />

    <h2 class="h5 mb-2">Gear</h2>

    {#if allGear.length === 0}
      <p class="text-muted">No gear on this Strava account.</p>
    {:else}
      <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-4 g-3 mb-5">
        {#each allGear as gear (gear.id)}
          <div class="col">
            <a
              href={stravaGearUrl(gear.id)}
              target="_blank"
              rel="noreferrer"
              class="card text-decoration-none h-100"
            >
              <div class="card-body">
                <h3 class="h6 card-title mb-1">
                  <span class="badge text-bg-secondary mb-1"
                    >{gear.id.startsWith("b") ? "Bike" : "Shoes"}</span
                  >
                  {gear.name}
                </h3>
                <p class="card-text text-muted small mb-0">
                  {formatDistance(gear.distance, units, 0)} total
                </p>
              </div>
            </a>
          </div>
        {/each}
      </div>
    {/if}

    <h2 class="h5 mb-3">Activities</h2>
    <RideList activities={snapshot.activities} {gearNames} {units} />
  </div>
{/if}
