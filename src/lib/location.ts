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

let pending: Promise<CachedLocation | null> | null = null;

// skipIfDenied: true for auto-detect, false for explicit user-initiated requests
export function detectLocation(skipIfDenied = true): Promise<CachedLocation | null> {
  if (skipIfDenied && getLocationPref() === 'denied') return Promise.resolve(null);

  const cached = getCached();
  if (cached) return Promise.resolve(cached);

  if (pending) return pending;

  const p = new Promise<CachedLocation | null>((resolve) => {
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
      }
    );
  }).finally(() => { pending = null; });

  pending = p;
  return p;
}
