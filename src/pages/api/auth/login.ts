import type { APIRoute } from 'astro';
import { buildAuthorizeUrl } from '../../../lib/strava';

export const GET: APIRoute = ({ url, redirect }) => {
  const redirectUri = new URL('/api/auth/callback', url).toString();
  return redirect(buildAuthorizeUrl(redirectUri));
};
