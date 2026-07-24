import type { APIRoute } from 'astro';
import { exchangeCodeForTokens } from '../../../lib/strava';
import { writeTokens } from '../../../lib/session';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const error = url.searchParams.get('error');
  if (error) {
    return redirect(`/?error=${encodeURIComponent(error)}`);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return redirect('/?error=missing_code');
  }

  const tokens = await exchangeCodeForTokens(code);
  writeTokens(cookies, tokens);
  return redirect('/dashboard');
};
