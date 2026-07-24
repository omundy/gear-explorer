// Pure URL builders, no imports - safe to bundle into client-side Svelte
// islands (unlike strava.ts, which pulls in server-only OAuth/fetch code).

const WEB_BASE = 'https://www.strava.com';

/**
 * Strava's own page for a piece of gear - we don't support editing gear
 * locally (Strava's API has no write endpoint for it anyway), so every
 * "edit" affordance in this app is a link out to here instead. Strava's
 * gear ids are prefixed "b" (bikes) or "g" (shoes), but the web URL drops
 * that prefix, e.g. gear id "b3468265" -> strava.com/bikes/3468265.
 */
export function stravaGearUrl(gearId: string): string {
  const kind = gearId.startsWith('b') ? 'bikes' : 'shoes';
  return `${WEB_BASE}/${kind}/${gearId.slice(1)}`;
}
