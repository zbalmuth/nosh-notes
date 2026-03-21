import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as api from '../lib/api';
import type { Restaurant, RestaurantList, Dish } from '../types';

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
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [lists, setLists] = useState<RestaurantList[]>([]);
  const [cuisineTags, setCuisineTags] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const refreshRestaurants = useCallback(async () => {
    const data = await api.getRestaurants();
    setRestaurants(data);
    // Also refresh cities from current data
    const citySet = new Set(data.map(r => r.city).filter(Boolean));
    setCities(Array.from(citySet).sort());
  }, []);

  const refreshLists = useCallback(async () => {
    const data = await api.getLists();
    setLists(data);
  }, []);

  const refreshCuisineTags = useCallback(async () => {
    const data = await api.getAllCuisineTags();
    setCuisineTags(data);
  }, []);

  useEffect(() => {
    Promise.all([refreshRestaurants(), refreshLists(), refreshCuisineTags()])
      .finally(() => setLoading(false));
  }, [refreshRestaurants, refreshLists, refreshCuisineTags]);

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
      }}
    >
      {children}
      {toast && <div className="toast">{toast}</div>}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
