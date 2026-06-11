const PREF_KEY = 'nosh-location-pref';

export interface UserLocation {
  lat: number;
  lng: number;
  city: string;
  state: string;
}

export function getLocationPref(): 'granted' | 'denied' | null {
  return localStorage.getItem(PREF_KEY) as 'granted' | 'denied' | null;
}

function setLocationPref(pref: 'granted' | 'denied') {
  localStorage.setItem(PREF_KEY, pref);
}

async function doGetPosition(): Promise<UserLocation | null> {
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
        resolve({ lat, lng, city, state });
      },
      () => {
        setLocationPref('denied');
        resolve(null);
      },
      { timeout: 10000 }
    );
  });
}

let pending: Promise<UserLocation | null> | null = null;

/**
 * Detect the user's current location.
 *
 * skipIfDenied=true  → auto-detect mode: never shows a permission dialog,
 *   only proceeds if the OS/browser permission is already 'granted'.
 *
 * skipIfDenied=false → explicit/user-initiated mode: will show the
 *   permission dialog if needed.
 */
export async function detectLocation(skipIfDenied = true): Promise<UserLocation | null> {
  if (skipIfDenied && getLocationPref() === 'denied') return null;

  if (skipIfDenied) {
    if (navigator.permissions) {
      try {
        const { state } = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (state === 'denied') { setLocationPref('denied'); return null; }
        if (state !== 'granted') return null;
      } catch {
        if (getLocationPref() !== 'granted') return null;
      }
    } else {
      if (getLocationPref() !== 'granted') return null;
    }
  }

  if (pending) return pending;
  pending = doGetPosition().finally(() => { pending = null; });
  return pending;
}
