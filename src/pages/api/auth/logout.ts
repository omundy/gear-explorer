import type { APIRoute } from 'astro';
import { clearTokens } from '../../../lib/session';

export const GET: APIRoute = ({ cookies, redirect }) => {
  clearTokens(cookies);
  return redirect('/');
};
