import { supabase } from './supabase';
import type { Restaurant, Dish, RestaurantList, SearchResult, SearchProvider } from '../types';

// ─── Auth ───────────────────────────────────────────────────────────────────
export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

// ─── Lists ──────────────────────────────────────────────────────────────────
export async function getLists(): Promise<RestaurantList[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createList(name: string): Promise<RestaurantList> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('lists')
    .insert({ name, user_id: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteList(id: string) {
  const { error } = await supabase.from('lists').delete().eq('id', id);
  if (error) throw error;
}

// ─── Restaurants ────────────────────────────────────────────────────────────
export async function getRestaurants(): Promise<Restaurant[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getRestaurant(id: string): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function addRestaurant(restaurant: Partial<Restaurant>): Promise<Restaurant> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('restaurants')
    .insert({ ...restaurant, user_id: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRestaurant(id: string, updates: Partial<Restaurant>): Promise<Restaurant> {
  const { data, error } = await supabase
    .from('restaurants')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRestaurant(id: string) {
  const { error } = await supabase.from('restaurants').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleFavorite(id: string, isFavorite: boolean) {
  return updateRestaurant(id, { is_favorite: isFavorite });
}

// ─── Dishes ─────────────────────────────────────────────────────────────────
export async function getDishes(restaurantId: string): Promise<Dish[]> {
  const { data, error } = await supabase
    .from('dishes')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addDish(dish: Partial<Dish>): Promise<Dish> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('dishes')
    .insert({ ...dish, user_id: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDish(id: string, updates: Partial<Dish>): Promise<Dish> {
  const { data, error } = await supabase
    .from('dishes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDish(id: string) {
  const { error } = await supabase.from('dishes').delete().eq('id', id);
  if (error) throw error;
}

// ─── Search (via Edge Function proxy) ───────────────────────────────────────
export async function searchRestaurants(
  query: string,
  provider: SearchProvider,
  location?: string
): Promise<SearchResult[]> {
  const { data, error } = await supabase.functions.invoke('search-restaurants', {
    body: { query, provider, location },
  });
  if (error) throw error;
  return data?.results || [];
}

// ─── AI Dish Recognition (via Edge Function proxy) ──────────────────────────
export async function analyzeDishImage(imageBase64: string): Promise<{
  dishes: { name: string; dish_type: string }[];
}> {
  const { data, error } = await supabase.functions.invoke('analyze-dish', {
    body: { image: imageBase64 },
  });
  if (error) throw error;
  return data;
}

// ─── Photo Upload ───────────────────────────────────────────────────────────
export async function uploadPhoto(file: File, bucket: string, path: string): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Cuisine Tags ───────────────────────────────────────────────────────────
export async function getAllCuisineTags(): Promise<string[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('cuisine_tags');
  if (error) throw error;
  const tags = new Set<string>();
  data?.forEach((r: { cuisine_tags: string[] }) => {
    r.cuisine_tags?.forEach((t: string) => tags.add(t));
  });
  return Array.from(tags).sort();
}

// ─── Cities ─────────────────────────────────────────────────────────────────
export async function getAllCities(): Promise<string[]> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('city');
  if (error) throw error;
  const cities = new Set<string>();
  data?.forEach((r: { city: string }) => {
    if (r.city) cities.add(r.city);
  });
  return Array.from(cities).sort();
}
