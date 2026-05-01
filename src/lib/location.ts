const CACHE_KEY = 'nosh-location-cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedLocation {
  lat: number;
  lng: number;
  city: string;
  state: string;
  ts: number;
}

function getCached(): CachedLocation | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedLocation = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL_MS) return null;
    return cached;
  } catch { return null; }
}

function setCache(lat: number, lng: number, city: string, state: string) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ lat, lng, city, state, ts: Date.now() }));
  } catch { /* ignore */ }
}

let pending: Promise<CachedLocation | null> | null = null;

export function detectLocation(): Promise<CachedLocation | null> {
  const cached = getCached();
  if (cached) return Promise.resolve(cached);

  // Deduplicate concurrent calls — share the same in-flight request
  if (pending) return pending;

  const p = new Promise<CachedLocation | null>((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
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
      () => resolve(null)
    );
  }).finally(() => { pending = null; });

  pending = p;
  return p;
}
