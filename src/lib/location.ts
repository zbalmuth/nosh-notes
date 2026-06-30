import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

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

// Great-circle distance in miles between two coordinates (Haversine).
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Human-readable distance label, e.g. "0.3 mi" or "2.4 mi".
export function formatDistance(miles: number): string {
  if (miles < 0.1) return '< 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function setLocationPref(pref: 'granted' | 'denied') {
  localStorage.setItem(PREF_KEY, pref);
}

// Reverse-geocode coordinates to a human-readable city/state.
async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; state: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    const data = await res.json();
    return {
      city: data.address?.city || data.address?.town || data.address?.village || '',
      state: data.address?.state || '',
    };
  } catch {
    return { city: '', state: '' };
  }
}

// ── Native path (Capacitor / CoreLocation) ──────────────────────────────────
// Uses the real native permission, which iOS persists across launches: once the
// user grants "While Using the App", checkPermissions() returns 'granted' and we
// never prompt again. We only call requestPermissions() (the dialog) when the
// status is still 'prompt' AND the caller allows prompting (skipIfDenied=false).
async function detectNative(skipIfDenied: boolean): Promise<UserLocation | null> {
  let status = (await Geolocation.checkPermissions()).location;

  if (status === 'denied') {
    setLocationPref('denied');
    return null;
  }

  if (status !== 'granted') {
    // status is 'prompt' / 'prompt-with-rationale'
    if (skipIfDenied) return null; // auto-detect: never show the dialog
    status = (await Geolocation.requestPermissions()).location;
    if (status !== 'granted') {
      setLocationPref('denied');
      return null;
    }
  }

  setLocationPref('granted');
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    const { latitude: lat, longitude: lng } = pos.coords;
    const { city, state } = await reverseGeocode(lat, lng);
    return { lat, lng, city, state };
  } catch {
    return null;
  }
}

// ── Web path (browser navigator.geolocation) ────────────────────────────────
async function doGetPositionWeb(): Promise<UserLocation | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationPref('granted');
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const { city, state } = await reverseGeocode(lat, lng);
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

async function detectWeb(skipIfDenied: boolean): Promise<UserLocation | null> {
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

  return doGetPositionWeb();
}

let pending: Promise<UserLocation | null> | null = null;

/**
 * Detect the user's current location.
 *
 * skipIfDenied=true  → auto-detect mode: never shows a permission dialog,
 *   only proceeds if location permission is already 'granted'.
 *
 * skipIfDenied=false → explicit/user-initiated mode: will show the
 *   permission dialog if the status is still 'prompt'.
 *
 * On native (Capacitor) this uses CoreLocation, whose permission iOS persists
 * across launches — so after the first grant it returns the live position
 * silently, without re-prompting. On web it uses navigator.geolocation.
 */
export async function detectLocation(skipIfDenied = true): Promise<UserLocation | null> {
  if (pending) return pending;
  const run = Capacitor.isNativePlatform() ? detectNative(skipIfDenied) : detectWeb(skipIfDenied);
  pending = run.finally(() => { pending = null; });
  return pending;
}
