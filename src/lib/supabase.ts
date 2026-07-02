import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Custom storage adapter: prefers sessionStorage (set when "Remember me" is off)
// so sessions survive same-tab refreshes but are cleared when the tab closes.
// Falls back to localStorage for persistent sessions ("Remember me" on).
const hybridStorage = {
  getItem: (key: string) =>
    window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (window.sessionStorage.getItem(key) !== null) {
      window.sessionStorage.setItem(key, value);
    } else {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'nosh-notes-auth',
    storage: hybridStorage,
    flowType: 'pkce',
  },
});
