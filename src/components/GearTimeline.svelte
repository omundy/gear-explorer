<script lang="ts">
  import {
    Chart,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Legend,
    Tooltip,
  } from "chart.js";
  import type { StravaActivity, StravaGearSummary } from "../lib/types";
  import type { Units } from "../lib/units";
  import { distanceValue, distanceUnitLabel } from "../lib/units";
  import { categoricalColor, MAX_CATEGORICAL_SERIES, OTHER_COLOR } from "../lib/chartColors";

  Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip);

  interface Props {
    activities: StravaActivity[];
    gear: StravaGearSummary[];
    units: Units;
  }
  const { activities, gear, units }: Props = $props();

  type Granularity = "year" | "month";
  let granularity = $state<Granularity>("year");
  let canvasEl: HTMLCanvasElement | undefined = $state();

  function periodKey(iso: string, g: Granularity): string {
    const d = new Date(iso);
    if (g === "year") return String(d.getFullYear());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function periodLabel(key: string, g: Granularity): string {
    if (g === "year") return key;
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }

  function nextPeriod(key: string, g: Granularity): string {
    if (g === "year") return String(Number(key) + 1);
    const [y, m] = key.split("-").map(Number);
    // `m` is 1-indexed (matches the key format); passing it as JS Date's
    // 0-indexed month argument lands on the following month for free.
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  interface TimelineDataset {
    label: string;
    color: string;
    data: number[];
  }

  function buildTimeline(g: Granularity): { labels: string[]; datasets: TimelineDataset[] } | null {
    const withGear = activities.filter((a) => a.gear_id);
    if (withGear.length === 0 || gear.length === 0) return null;

    // Rank gear by total distance so the biggest story gets the earliest,
    // most-distinct palette slots. Ranking is based on all-time distance
    // (not the current granularity), so a gear's color/order never changes
    // when toggling Year/Month.
    const totalByGear = new Map<string, number>();
    for (const a of withGear) {
      totalByGear.set(a.gear_id!, (totalByGear.get(a.gear_id!) ?? 0) + a.distance);
    }
    const rankedGearIds = [...totalByGear.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const gearNameById = new Map(gear.map((x) => [x.id, x.name]));
    const shownIds = rankedGearIds.slice(0, MAX_CATEGORICAL_SERIES);
    const hasOther = rankedGearIds.length > MAX_CATEGORICAL_SERIES;

    // A continuous period range (gaps filled with 0) so a line visibly
    // falls to zero across an unused stretch instead of skipping over it.
    const keys = withGear.map((a) => periodKey(a.start_date_local, g)).sort();
    const first = keys[0];
    const last = keys[keys.length - 1];
    const allPeriods: string[] = [];
    for (let k = first; ; k = nextPeriod(k, g)) {
      allPeriods.push(k);
      if (k === last) break;
    }

    const sums = new Map<string, Map<string, number>>(); // gearId | 'other' -> period -> meters
    for (const a of withGear) {
      const key = periodKey(a.start_date_local, g);
      const id = shownIds.includes(a.gear_id!) ? a.gear_id! : "other";
      if (!sums.has(id)) sums.set(id, new Map());
      const perPeriod = sums.get(id)!;
      perPeriod.set(key, (perPeriod.get(key) ?? 0) + a.distance);
    }

    const datasets: TimelineDataset[] = shownIds.map((id, i) => ({
      label: gearNameById.get(id) ?? id,
      color: categoricalColor(i),
      data: allPeriods.map((p) => distanceValue(sums.get(id)?.get(p) ?? 0, units)),
    }));
    if (hasOther) {
      datasets.push({
        label: "Other gear",
        color: OTHER_COLOR,
        data: allPeriods.map((p) => distanceValue(sums.get("other")?.get(p) ?? 0, units)),
      });
    }

    return { labels: allPeriods.map((p) => periodLabel(p, g)), datasets };
  }

  const timeline = $derived(buildTimeline(granularity));

  $effect(() => {
    if (!canvasEl || !timeline) return;

    const chart = new Chart(canvasEl, {
      type: "line",
      data: {
        labels: timeline.labels,
        datasets: timeline.datasets.map((d) => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: d.color,
          pointBorderColor: "#fcfcfb",
          pointBorderWidth: 2,
          tension: 0.15,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: timeline.datasets.length > 1,
            position: "top",
            labels: { boxWidth: 16, boxHeight: 2, color: "#52514e" },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y as number).toFixed(1)} ${distanceUnitLabel(units)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: "#e1e0d9", drawOnChartArea: false },
            ticks: { color: "#898781" },
          },
          y: {
            grid: { color: "#e1e0d9" },
            ticks: { color: "#898781" },
            title: { display: true, text: `Distance (${distanceUnitLabel(units)})`, color: "#52514e" },
            beginAtZero: true,
          },
        },
      },
    });

    return () => chart.destroy();
  });
</script>

<div class="mb-4">
  <div class="d-flex justify-content-between align-items-center mb-2">
    <h2 class="h5 mb-0">Usage over time</h2>
    <div class="btn-group btn-group-sm" role="group" aria-label="Timeline granularity">
      <button
        type="button"
        class={`btn ${granularity === "year" ? "btn-secondary" : "btn-outline-secondary"}`}
        onclick={() => (granularity = "year")}
      >
        Year
      </button>
      <button
        type="button"
        class={`btn ${granularity === "month" ? "btn-secondary" : "btn-outline-secondary"}`}
        onclick={() => (granularity = "month")}
      >
        Month
      </button>
    </div>
  </div>

  {#if timeline}
    <div style="height: 320px;">
      <canvas bind:this={canvasEl}></canvas>
    </div>
  {:else}
    <p class="text-muted">No activities with gear attached yet.</p>
  {/if}
</div>
