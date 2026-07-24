export type Units = 'metric' | 'imperial';

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** Raw numeric distance in the given unit (km or mi) - for charting/math, not display. */
export function distanceValue(meters: number, units: Units): number {
  return units === 'imperial' ? meters / METERS_PER_MILE : meters / 1000;
}

export function distanceUnitLabel(units: Units): 'mi' | 'km' {
  return units === 'imperial' ? 'mi' : 'km';
}

export function formatDistance(meters: number, units: Units, precision = 1): string {
  return `${distanceValue(meters, units).toFixed(precision)} ${distanceUnitLabel(units)}`;
}

export function formatElevation(meters: number, units: Units): string {
  if (units === 'imperial') {
    return `${Math.round(meters / METERS_PER_FOOT)} ft`;
  }
  return `${Math.round(meters)} m`;
}
