// Pure URL builders, no imports - safe to bundle into client-side Svelte
// islands (unlike strava.ts, which pulls in server-only OAuth/fetch code).

const WEB_BASE = 'https://www.strava.com';

/**
 * Strava's own page for a piece of gear - we don't support editing gear
 * locally (Strava's API has no write endpoint for it anyway), so every
 * "edit" affordance in this app is a link out to here instead.
 *
 * Bikes have individual pages: gear id "b3468265" -> strava.com/bikes/3468265
 * (the "b" prefix is dropped from the URL). Shoes don't get individual
 * pages at all - every shoe is edited from the single shared
 * strava.com/settings/gear screen, so that's what we link to regardless
 * of which shoe it is.
 */
export function stravaGearUrl(gearId: string): string {
  if (gearId.startsWith('b')) {
    return `${WEB_BASE}/bikes/${gearId.slice(1)}`;
  }
  return `${WEB_BASE}/settings/gear`;
}
