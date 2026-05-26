const CACHE_KEY = 'nosh-location-cache';
const PREF_KEY = 'nosh-location-pref';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedLocation {
  lat: number;
  lng: number;
  city: string;
  state: string;
  ts: number;
}

function getCached(): CachedLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedLocation = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL_MS) return null;
    return cached;
  } catch { return null; }
}

function setCache(lat: number, lng: number, city: string, state: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ lat, lng, city, state, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function getLocationPref(): 'granted' | 'denied' | null {
  return localStorage.getItem(PREF_KEY) as 'granted' | 'denied' | null;
}

function setLocationPref(pref: 'granted' | 'denied') {
  localStorage.setItem(PREF_KEY, pref);
}

async function doGetPosition(): Promise<CachedLocation | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationPref('granted');
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let city = '';
        let state = '';
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
          );
          const data = await res.json();
          city = data.address?.city || data.address?.town || data.address?.village || '';
          state = data.address?.state || '';
        } catch { /* ignore */ }
        setCache(lat, lng, city, state);
        resolve({ lat, lng, city, state, ts: Date.now() });
      },
      () => {
        setLocationPref('denied');
        resolve(null);
      },
      { timeout: 10000 }
    );
  });
}

let pending: Promise<CachedLocation | null> | null = null;

/**
 * Detect the user's location.
 *
 * skipIfDenied=true  → auto-detect mode:
 *   - Never shows a browser/OS permission dialog.
 *   - Only proceeds if the Permissions API confirms permission is already 'granted',
 *     or if we stored 'granted' from a previous explicit request.
 *   - Returns null silently if permission is unknown or denied.
 *
 * skipIfDenied=false → explicit/user-initiated mode:
 *   - Will show the permission dialog if needed (user tapped a button).
 */
export async function detectLocation(skipIfDenied = true): Promise<CachedLocation | null> {
  // Hard stop: user previously denied
  if (skipIfDenied && getLocationPref() === 'denied') return null;

  // Return from cache if fresh
  const cached = getCached();
  if (cached) return cached;

  // For auto-detect: check if permission is already granted before potentially prompting
  if (skipIfDenied) {
    if (navigator.permissions) {
      try {
        const { state } = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (state === 'denied') {
          setLocationPref('denied');
          return null;
        }
        if (state !== 'granted') {
          // 'prompt' — permission not yet decided; don't auto-ask, wait for explicit user action
          return null;
        }
        // state === 'granted' — fall through to get position silently
      } catch {
        // Permissions API unsupported; only proceed if we've previously confirmed 'granted'
        if (getLocationPref() !== 'granted') return null;
      }
    } else {
      // No Permissions API (older browsers); fall back to our stored pref
      if (getLocationPref() !== 'granted') return null;
    }
  }

  // Deduplicate concurrent calls
  if (pending) return pending;
  pending = doGetPosition().finally(() => { pending = null; });
  return pending;
}
