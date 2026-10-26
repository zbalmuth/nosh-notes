import { useEffect, useState } from 'react';

const PREFIX = 'nosh-draft:';
// Long enough to survive a trip to another app (iOS may kill the WebView while
// it's in the background, which wipes React state); short enough that a search
// from last week isn't sitting there when you open the app.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw) as { t: number; v: T };
    return Date.now() - t < MAX_AGE_MS ? v : undefined;
  } catch {
    return undefined;
  }
}

// Drops every draft whose key starts with `prefix` — call once the thing it
// was a draft of has been saved.
export function clearPersistentState(prefix: string) {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX + prefix)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable — nothing to clear
  }
}

// useState that outlives the page: leaving the tab, switching apps, or the OS
// killing the app in the background all come back to where you left off.
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read<T>(key) ?? initial);
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch {
      // quota or private mode — fall back to plain in-memory state
    }
  }, [key, value]);
  return [value, setValue] as const;
}
