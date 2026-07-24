export type Units = 'metric' | 'imperial';

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

export function formatDistance(meters: number, units: Units, precision = 1): string {
  if (units === 'imperial') {
    return `${(meters / METERS_PER_MILE).toFixed(precision)} mi`;
  }
  return `${(meters / 1000).toFixed(precision)} km`;
}

export function formatElevation(meters: number, units: Units): string {
  if (units === 'imperial') {
    return `${Math.round(meters / METERS_PER_FOOT)} ft`;
  }
  return `${Math.round(meters)} m`;
}
