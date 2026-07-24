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

// Past 8 series the palette can't stay distinct under CVD simulation - fold
// the rest into a single neutral "Other" line instead of generating a 9th
// hue (see dataviz skill's anti-patterns: "Cycling / generating hues past 8").
export const OTHER_COLOR = '#898781';

export const MAX_CATEGORICAL_SERIES = CATEGORICAL_PALETTE.length;

export function categoricalColor(index: number): string {
  return CATEGORICAL_PALETTE[index] ?? OTHER_COLOR;
}
