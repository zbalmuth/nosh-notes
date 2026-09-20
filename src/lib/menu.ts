import type { Restaurant } from '../types';

// Earlier versions built a menu link by appending "/menu" to the Google Maps
// place URL. Those URLs are query-string based (…/?cid=123…), so the suffix
// lands inside the query and the link goes nowhere. Such values are still in
// the database, so detect and ignore them wherever a menu link is used.
export function isBrokenGoogleMenuUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /[?&][^/]*\/menu\/?$/.test(url);
}

function isHttp(url: string | undefined | null): url is string {
  return !!url && (url.startsWith('http://') || url.startsWith('https://'));
}

// The best URL to reach this restaurant's menu, or '' if there isn't one.
// Falls back to the restaurant's own website — the menu analyzer follows a
// homepage to its menu page, and it's a link a person can actually use.
export function resolveMenuUrl(
  restaurant: Pick<Restaurant, 'menu_url' | 'website'> | null | undefined,
): string {
  if (!restaurant) return '';
  const menu = restaurant.menu_url;
  if (isHttp(menu) && !isBrokenGoogleMenuUrl(menu)) return menu;
  return isHttp(restaurant.website) ? restaurant.website : '';
}
