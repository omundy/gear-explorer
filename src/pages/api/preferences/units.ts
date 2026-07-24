import type { APIRoute } from 'astro';
import { writeUnits } from '../../../lib/preferences';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json();
  const units = body.units === 'imperial' ? 'imperial' : 'metric';
  writeUnits(cookies, units);
  return new Response(null, { status: 204 });
};
