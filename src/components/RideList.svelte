<script lang="ts">
  import type { StravaActivity } from '../lib/types';
  import { formatDistance, formatElevation, type Units } from '../lib/units';
  import { stravaGearUrl } from '../lib/stravaLinks';

  interface Props {
    activities: StravaActivity[];
    gearNames: Record<string, string>;
    units: Units;
  }
  const { activities, gearNames, units }: Props = $props();

  const PER_PAGE_OPTIONS = [10, 25, 50, 100];

  let selectedGear = $state('all');
  let page = $state(1);
  let perPage = $state(25);

  type SortKey = 'date' | 'sport' | 'name' | 'gear' | 'distance' | 'elevation' | 'time';
  type SortDir = 'asc' | 'desc';

  const columns: [SortKey, string][] = [
    ['date', 'Date'],
    ['sport', 'Sport'],
    ['name', 'Activity'],
    ['gear', 'Gear'],
    ['distance', 'Distance'],
    ['elevation', 'Elevation'],
    ['time', 'Time'],
  ];

  // Columns that read most naturally biggest/most-recent-first on the first click.
  const defaultDir: Record<SortKey, SortDir> = {
    date: 'desc',
    sport: 'asc',
    name: 'asc',
    gear: 'asc',
    distance: 'desc',
    elevation: 'desc',
    time: 'desc',
  };

  function sortValue(activity: StravaActivity, key: SortKey): string | number {
    switch (key) {
      case 'date':
        return activity.start_date_local;
      case 'sport':
        return activity.sport_type;
      case 'name':
        return activity.name.toLowerCase();
      case 'gear':
        return activity.gear_id ? (gearNames[activity.gear_id] ?? activity.gear_id).toLowerCase() : '';
      case 'distance':
        return activity.distance;
      case 'elevation':
        return activity.total_elevation_gain;
      case 'time':
        return activity.moving_time;
    }
  }

  let sortKey = $state<SortKey>('date');
  let sortDir = $state<SortDir>('desc');

  function setSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = defaultDir[key];
    }
    page = 1;
  }

  function setGearFilter(value: string) {
    selectedGear = value;
    page = 1;
  }

  function setPerPage(value: number) {
    perPage = value;
    page = 1;
  }

  // "TrailRun" -> "Trail Run", "MountainBikeRide" -> "Mountain Bike Ride".
  function formatSport(sportType: string): string {
    return sportType.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  const gearOptions = $derived([...new Set(activities.map((a) => a.gear_id).filter(Boolean))] as string[]);

  const filtered = $derived(
    selectedGear === 'all' ? activities : activities.filter((a) => a.gear_id === selectedGear),
  );

  const sorted = $derived(
    [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    }),
  );

  // All pagination happens over data already in memory - no network
  // requests, which is the point (see /api/strava/sync for the one place
  // that actually talks to Strava).
  const totalPages = $derived(Math.max(1, Math.ceil(sorted.length / perPage)));
  const currentPage = $derived(Math.min(page, totalPages));
  const pageItems = $derived(sorted.slice((currentPage - 1) * perPage, currentPage * perPage));

  function goToPage(p: number) {
    page = Math.min(Math.max(1, p), totalPages);
  }

  function duration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function date(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<div>
  <div class="d-flex flex-wrap align-items-center gap-3 mb-3">
    <div class="d-flex align-items-center gap-2">
      <label class="small text-muted mb-0" for="gear-filter">Gear</label>
      <select
        id="gear-filter"
        class="form-select form-select-sm w-auto"
        value={selectedGear}
        onchange={(e) => setGearFilter(e.currentTarget.value)}
      >
        <option value="all">All gear</option>
        {#each gearOptions as gearId}
          <option value={gearId}>{gearNames[gearId] ?? gearId}</option>
        {/each}
      </select>
    </div>
    <div class="d-flex align-items-center gap-2">
      <label class="small text-muted mb-0" for="per-page">Show</label>
      <select
        id="per-page"
        class="form-select form-select-sm w-auto"
        value={perPage}
        onchange={(e) => setPerPage(Number(e.currentTarget.value))}
      >
        {#each PER_PAGE_OPTIONS as n}
          <option value={n}>{n} per page</option>
        {/each}
      </select>
    </div>
    <div class="small text-muted ms-auto">{sorted.length} activit{sorted.length === 1 ? 'y' : 'ies'}</div>
  </div>

  {#if sorted.length === 0}
    <p class="text-muted">No activities for this gear yet.</p>
  {:else}
    <div class="table-responsive">
      <table class="table table-striped table-hover align-middle mb-0">
        <thead>
          <tr>
            {#each columns as [key, label] (key)}
              <th>
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 fw-semibold text-decoration-none"
                  onclick={() => setSort(key)}
                >
                  {label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each pageItems as activity (activity.id)}
            <tr>
              <td>{date(activity.start_date_local)}</td>
              <td>{formatSport(activity.sport_type)}</td>
              <td>
                <a href={`https://www.strava.com/activities/${activity.id}`} target="_blank" rel="noreferrer">
                  {activity.name}
                </a>
              </td>
              <td>
                {#if activity.gear_id}
                  <a href={stravaGearUrl(activity.gear_id)} target="_blank" rel="noreferrer">
                    {gearNames[activity.gear_id] ?? activity.gear_id}
                  </a>
                {:else}
                  —
                {/if}
              </td>
              <td>{formatDistance(activity.distance, units)}</td>
              <td>{formatElevation(activity.total_elevation_gain, units)}</td>
              <td>{duration(activity.moving_time)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <nav aria-label="Activity pages" class="mt-3">
      <ul class="pagination justify-content-center mb-0">
        <li class={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
          <button type="button" class="page-link" onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
            Previous
          </button>
        </li>
        <li class="page-item disabled">
          <span class="page-link">Page {currentPage} of {totalPages}</span>
        </li>
        <li class={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
          <button
            type="button"
            class="page-link"
            onclick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </li>
      </ul>
    </nav>
  {/if}
</div>
