import type { APIRoute } from 'astro';
import { getValidTokens } from '../../../lib/session';
import { fetchAllActivities, fetchAthlete, fetchGear } from '../../../lib/strava';
import { getUsage, recordCalls } from '../../../lib/apiUsage';
import type { StravaGearDetail } from '../../../lib/types';

// Fetches everything (athlete, every bike/shoe's detail, every activity)
// from Strava in one go and returns it as JSON - this is the only place
// that ever calls Strava, and the only place that spends the daily call
// budget (apiUsage.ts). The client (GearDashboard.svelte) is entirely
// responsible for persisting the result - it writes straight to IndexedDB,
// there's no server-side copy of the activity data at all.
export const POST: APIRoute = async ({ cookies }) => {
  const tokens = await getValidTokens(cookies);
  if (!tokens) return new Response('Unauthorized', { status: 401 });

  const usage = getUsage(cookies);
  if (usage.remaining <= 0) {
    return new Response('Daily Strava API call budget exhausted', { status: 429 });
  }

  let calls = 0;

  const athlete = await fetchAthlete(tokens.access_token);
  calls++;

  const gearDetails: Record<string, StravaGearDetail> = {};
  for (const gear of [...athlete.bikes, ...athlete.shoes]) {
    gearDetails[gear.id] = await fetchGear(gear.id, tokens.access_token);
    calls++;
  }

  const { activities, calls: activityCalls } = await fetchAllActivities(tokens.access_token);
  calls += activityCalls;

  recordCalls(cookies, calls);

  return Response.json({
    snapshot: {
      athlete,
      gearDetails,
      activities,
      fetchedAt: new Date().toISOString(),
    },
    callsUsed: calls,
  });
};
