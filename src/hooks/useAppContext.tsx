import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import * as api from '../lib/api';
import type { Restaurant, RestaurantList, Dish } from '../types';
import { Loader, Check } from 'lucide-react';
import { sendNotification } from '../lib/notifications';
import { getCached, getCachedAge, setCached } from '../lib/cache';

const DISH_PREFETCH_FRESH_MS = 10 * 60 * 1000; // skip refetching dishes cached within 10 min

function citiesFrom(restaurants: Restaurant[]): string[] {
  return Array.from(new Set(restaurants.map((r) => r.city).filter(Boolean))).sort();
}

interface ImportProgress {
  total: number;
  done: number;
  restaurantName: string;
  status: 'running' | 'done';
  currentDishName?: string;
}

interface AppContextType {
  restaurants: Restaurant[];
  lists: RestaurantList[];
  cuisineTags: string[];
  cities: string[];
  loading: boolean;
  refreshRestaurants: () => Promise<void>;
  refreshLists: () => Promise<void>;
  refreshCuisineTags: () => Promise<void>;
  addRestaurant: (r: Partial<Restaurant>) => Promise<Restaurant>;
  updateRestaurant: (id: string, r: Partial<Restaurant>) => Promise<void>;
  deleteRestaurant: (id: string) => Promise<void>;
  toggleFavorite: (id: string, fav: boolean) => Promise<void>;
  addList: (name: string) => Promise<RestaurantList>;
  deleteList: (id: string) => Promise<void>;
  getDishes: (restaurantId: string) => Promise<Dish[]>;
  addDish: (d: Partial<Dish>) => Promise<Dish>;
  updateDish: (id: string, d: Partial<Dish>) => Promise<void>;
  deleteDish: (id: string) => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
  importProgress: ImportProgress | null;
  startBackgroundImport: (items: Partial<Dish>[], restaurantName: string) => void;
  dishesRevision: number;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Instant paint: seed state from localStorage synchronously so the home
  // list renders immediately on cold start, then refresh from Supabase below.
  const [restaurants, setRestaurants] = useState<Restaurant[]>(
    () => getCached<Restaurant[]>('restaurants') ?? []
  );
  const [lists, setLists] = useState<RestaurantList[]>(() => getCached<RestaurantList[]>('lists') ?? []);
  const [cuisineTags, setCuisineTags] = useState<string[]>(() => getCached<string[]>('cuisineTags') ?? []);
  const [cities, setCities] = useState<string[]>(() => citiesFrom(getCached<Restaurant[]>('restaurants') ?? []));
  const [loading, setLoading] = useState(() => getCached<Restaurant[]>('restaurants') === null);
  const [toast, setToast] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const refreshRestaurants = useCallback(async () => {
    const data = await api.getRestaurants();
    setRestaurants(data);
    setCached('restaurants', data);
    setCities(citiesFrom(data));
  }, []);

  const refreshLists = useCallback(async () => {
    const data = await api.getLists();
    setLists(data);
    setCached('lists', data);
  }, []);

  const refreshCuisineTags = useCallback(async () => {
    const data = await api.getAllCuisineTags();
    setCuisineTags(data);
    setCached('cuisineTags', data);
  }, []);

  useEffect(() => {
    Promise.all([refreshRestaurants(), refreshLists(), refreshCuisineTags()])
      .finally(() => setLoading(false));
  }, [refreshRestaurants, refreshLists, refreshCuisineTags]);

  // Background prefetch: once the restaurant list is known (from cache or
  // network), warm each restaurant's dish list in localStorage one at a time
  // so opening any restaurant page paints instantly instead of spinning.
  const prefetchStarted = useRef(false);
  useEffect(() => {
    if (prefetchStarted.current || restaurants.length === 0) return;
    prefetchStarted.current = true;
    (async () => {
      for (const r of restaurants) {
        const age = getCachedAge(`dishes:${r.id}`);
        if (age !== null && age < DISH_PREFETCH_FRESH_MS) continue;
        try {
          const dishes = await api.getDishes(r.id);
          setCached(`dishes:${r.id}`, dishes);
        } catch {
          // Prefetch is best-effort; the restaurant page will fetch on demand.
        }
      }
    })();
  }, [restaurants]);

  const addRestaurant = useCallback(async (r: Partial<Restaurant>) => {
    const added = await api.addRestaurant(r);
    await refreshRestaurants();
    await refreshCuisineTags();
    showToast('Restaurant added!');
    return added;
  }, [refreshRestaurants, refreshCuisineTags, showToast]);

  const updateRestaurant = useCallback(async (id: string, r: Partial<Restaurant>) => {
    await api.updateRestaurant(id, r);
    await refreshRestaurants();
    await refreshCuisineTags();
  }, [refreshRestaurants, refreshCuisineTags]);

  const deleteRestaurant = useCallback(async (id: string) => {
    await api.deleteRestaurant(id);
    await refreshRestaurants();
    showToast('Restaurant deleted');
  }, [refreshRestaurants, showToast]);

  const toggleFavorite = useCallback(async (id: string, fav: boolean) => {
    await api.toggleFavorite(id, fav);
    await refreshRestaurants();
  }, [refreshRestaurants]);

  const addList = useCallback(async (name: string) => {
    const list = await api.createList(name);
    await refreshLists();
    showToast(`List "${name}" created`);
    return list;
  }, [refreshLists, showToast]);

  const deleteList = useCallback(async (id: string) => {
    await api.deleteList(id);
    await refreshLists();
    showToast('List deleted');
  }, [refreshLists, showToast]);

  const getDishes = useCallback(async (restaurantId: string) => {
    return api.getDishes(restaurantId);
  }, []);

  const addDish = useCallback(async (d: Partial<Dish>) => {
    const dish = await api.addDish(d);
    showToast('Dish added!');
    return dish;
  }, [showToast]);

  const updateDish = useCallback(async (id: string, d: Partial<Dish>) => {
    await api.updateDish(id, d);
  }, []);

  const deleteDish = useCallback(async (id: string) => {
    await api.deleteDish(id);
    showToast('Dish deleted');
  }, [showToast]);

  // Bumped when a background import lands, so a restaurant page that loaded
  // its dishes while the import was still running knows to reload them.
  const [dishesRevision, setDishesRevision] = useState(0);

  // Background import: kicks off async insert without blocking navigation
  const startBackgroundImport = useCallback((items: Partial<Dish>[], restaurantName: string) => {
    if (items.length === 0) return;
    (async () => {
      setImportProgress({ total: items.length, done: 0, restaurantName, status: 'running', currentDishName: items[0]?.name });
      let added = 0;
      try {
        const saved = await api.addDishes(items);
        added = saved.length;
        // Paint them straight away: the restaurant page shows its cached list
        // first, so this is what makes them appear without a second fetch.
        const restaurantId = items[0].restaurant_id;
        if (restaurantId) {
          setCached(`dishes:${restaurantId}`, [...saved, ...(getCached<Dish[]>(`dishes:${restaurantId}`) ?? [])]);
        }
      } catch (err) {
        console.error('Background import failed:', err);
      }
      setDishesRevision((r) => r + 1);
      if (added === 0) {
        setImportProgress(null);
        showToast(`Couldn't add dishes to ${restaurantName}. Try again.`);
        return;
      }
      setImportProgress({ total: added, done: added, restaurantName, status: 'done' });
      showToast(`${added} dish${added !== 1 ? 'es' : ''} added!`);
      await sendNotification(
        'Import complete!',
        `${added} dish${added !== 1 ? 'es' : ''} added to ${restaurantName}`,
      );
      setTimeout(() => setImportProgress(null), 3000);
    })();
  }, [showToast]);

  return (
    <AppContext.Provider
      value={{
        restaurants,
        lists,
        cuisineTags,
        cities,
        loading,
        refreshRestaurants,
        refreshLists,
        refreshCuisineTags,
        addRestaurant,
        updateRestaurant,
        deleteRestaurant,
        toggleFavorite,
        addList,
        deleteList,
        getDishes,
        addDish,
        updateDish,
        deleteDish,
        toast,
        showToast,
        importProgress,
        startBackgroundImport,
        dishesRevision,
      }}
    >
      {children}
      {toast && <div className="toast">{toast}</div>}

      {/* Floating background import progress indicator */}
      {importProgress && (
        <div style={{
          position: 'fixed',
          bottom: 72,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-card)',
          border: '1.5px solid var(--border)',
          borderRadius: 12,
          padding: '10px 16px',
          zIndex: 8000,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          minWidth: 220,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {importProgress.status === 'running' ? (
            <Loader size={15} className="spin" style={{ color: 'var(--hot-pink)', flexShrink: 0 }} />
          ) : (
            <Check size={15} style={{ color: '#4caf50', flexShrink: 0 }} />
          )}
          <div>
            <div style={{ fontSize: 12, fontFamily: "'Righteous', cursive", color: 'var(--text-primary)' }}>
              {importProgress.status === 'done' ? 'Import complete!' : `${importProgress.done}/${importProgress.total} · ${importProgress.restaurantName}`}
            </div>
            {importProgress.status === 'running' && importProgress.currentDishName && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Saving: {importProgress.currentDishName}
              </div>
            )}
            {importProgress.status === 'done' && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {importProgress.total} dishes added to {importProgress.restaurantName}
              </div>
            )}
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
