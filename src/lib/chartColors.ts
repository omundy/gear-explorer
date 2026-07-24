import type { StravaActivity } from './types';

// Validated categorical palette (light surface only - this app has no dark
// mode). Fixed hue order, never cycled/re-ranked - each gear keeps its slot
// for as long as it's on the chart, so a reader who learns "the gravel bike
// is blue" stays right. Validated with the dataviz skill's
// scripts/validate_palette.js: all adjacent-pair CVD/contrast gates pass:
// worst adjacent CVD ΔE 9.1, worst adjacent normal-vision ΔE 19.6 (both
// above the 8/15 floors). Three slots (aqua, yellow, magenta) sit under 3:1
// text contrast on white, which is fine for a 2px line + legend swatch but
// is why these never get used as text color, only as the mark itself.
const CATEGORICAL_PALETTE = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
] as const;

// Neutral gray for gear that has no ranking at all (zero activities - see
// gearColorMap below), not part of the categorical sequence.
export const OTHER_COLOR = '#898781';

export const PALETTE_SIZE = CATEGORICAL_PALETTE.length;

// Past 8 series, color alone can't stay distinct even under normal vision -
// the palette itself fails validation past 8 (checked with
// scripts/validate_palette.js --pairs all: worst all-pairs CVD ΔE drops to
// 3.2, worst normal-vision ΔE to 7.1, both well under the floors). Adding a
// 9th hue or reusing one flat would both be indistinguishable from an
// existing line. Instead, past index 7 this cycles back through the same 8
// colors paired with a new line-dash pattern each lap (see
// categoricalDash) - genuinely reused hue, but never ambiguous, since no
// two series ever share both color AND dash.
export function categoricalColor(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}

// Chart.js borderDash segment arrays. [] is solid. Only ever applied from
// the second lap onward (index >= 8) - the first 8 series stay solid,
// unchanged from the original single-lap palette.
const DASH_PATTERNS: readonly number[][] = [
  [],
  [7, 4],
  [2, 3],
  [10, 3, 2, 3],
];

export function categoricalDash(index: number): number[] {
  const lap = Math.floor(index / CATEGORICAL_PALETTE.length) % DASH_PATTERNS.length;
  return DASH_PATTERNS[lap];
}

/**
 * Gear ids ranked by lifetime distance, highest first - the single ranking
 * both GearTimeline (chart lines) and the gear cards use, so a gear's color
 * is identical wherever it's shown. Gear with no activities at all doesn't
 * appear (there's no distance to rank it by).
 */
export function rankGearByDistance(activities: StravaActivity[]): string[] {
  const totalByGear = new Map<string, number>();
  for (const a of activities) {
    if (!a.gear_id) continue;
    totalByGear.set(a.gear_id, (totalByGear.get(a.gear_id) ?? 0) + a.distance);
  }
  return [...totalByGear.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Gear id -> its chart color, using the same rank-based assignment as GearTimeline. */
export function gearColorMap(activities: StravaActivity[]): Map<string, string> {
  const ranked = rankGearByDistance(activities);
  return new Map(ranked.map((id, i) => [id, categoricalColor(i)]));
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

// Ink tokens from the dataviz skill's palette, used here as text-on-color
// rather than text-on-surface.
const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#0b0b0b';

/** Black or white ink, whichever contrasts better against the given hex background. */
export function readableTextColor(hex: string): string {
  const lum = relativeLuminance(hex);
  const contrastWithLight = 1.05 / (lum + 0.05);
  const contrastWithDark = (lum + 0.05) / 0.05;
  return contrastWithLight >= contrastWithDark ? LIGHT_TEXT : DARK_TEXT;
}
