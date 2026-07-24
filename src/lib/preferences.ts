import type { AstroCookies } from 'astro';
import type { Units } from './units';

const COOKIE_NAME = 'units';

export function readUnits(cookies: AstroCookies): Units {
  return cookies.get(COOKIE_NAME)?.value === 'imperial' ? 'imperial' : 'metric';
}

export function writeUnits(cookies: AstroCookies, units: Units): void {
  cookies.set(COOKIE_NAME, units, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
}
