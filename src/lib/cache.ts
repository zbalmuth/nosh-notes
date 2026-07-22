// Tiny localStorage cache for instant paints: pages render cached data
// immediately and refresh from Supabase in the background.
const PREFIX = 'nosh-cache:';
const MAX_DISH_ENTRIES = 60;

interface Envelope<T> {
  t: number; // stored at, ms epoch
  v: T;
}

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return (JSON.parse(raw) as Envelope<T>).v;
  } catch {
    return null;
  }
}

// Age (ms) of a cached entry, or null if missing/unreadable. Lets callers
// skip re-fetching things that were cached recently (e.g. background prefetch).
export function getCachedAge(key: string): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return Date.now() - (JSON.parse(raw) as Envelope<unknown>).t;
  } catch {
    return null;
  }
}

export function setCached(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    if (key.startsWith('dishes:')) pruneDishes();
  } catch {
    // quota exceeded — drop old per-restaurant dish caches and retry once
    try {
      pruneDishes(0);
      localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch {}
  }
}

export function dropCached(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}

// Keep only the most recently written per-restaurant dish payloads.
function pruneDishes(keep = MAX_DISH_ENTRIES) {
  const entries: { key: string; t: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX + 'dishes:')) {
      try {
        entries.push({ key: k, t: (JSON.parse(localStorage.getItem(k) ?? '{}') as Envelope<unknown>).t ?? 0 });
      } catch {
        entries.push({ key: k, t: 0 });
      }
    }
  }
  entries
    .sort((a, b) => b.t - a.t)
    .slice(keep)
    .forEach(({ key }) => localStorage.removeItem(key));
}
