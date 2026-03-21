export interface Restaurant {
  id: string;
  user_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  website: string;
  yelp_url: string;
  google_url: string;
  menu_url: string;
  image_url: string;
  photos: string[];
  price_level: string;
  external_rating: number | null;
  cuisine_tags: string[];
  lists: string[];
  is_favorite: boolean;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Dish {
  id: string;
  restaurant_id: string;
  user_id: string;
  name: string;
  dish_type: DishType;
  rating: number | null;
  want_to_try: boolean;
  notes: string;
  photos: string[];
  created_at: string;
  updated_at: string;
}

export type DishType =
  | 'appetizer'
  | 'salad'
  | 'soup'
  | 'side'
  | 'entree'
  | 'drink'
  | 'dessert';

export interface RestaurantList {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export type SearchProvider = 'yelp' | 'google';

export interface SearchResult {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  website: string;
  yelp_url: string;
  google_url: string;
  menu_url: string;
  image_url: string;
  photos: string[];
  price_level: string;
  rating: number | null;
  cuisine_tags: string[];
  latitude: number | null;
  longitude: number | null;
}

export const DISH_TYPES: { value: DishType; label: string }[] = [
  { value: 'appetizer', label: 'Appetizer' },
  { value: 'salad', label: 'Salad' },
  { value: 'soup', label: 'Soup' },
  { value: 'side', label: 'Side' },
  { value: 'entree', label: 'Entrée' },
  { value: 'drink', label: 'Drink' },
  { value: 'dessert', label: 'Dessert' },
];

export const RATING_LABELS: Record<number, string> = {
  0: 'Dislike',
  2: 'Edible',
  4: 'Okay',
  6: 'Good',
  8: 'Great',
  10: 'Amazing',
};

export function getRatingLabel(rating: number): string {
  // Find the nearest label
  const keys = Object.keys(RATING_LABELS).map(Number).sort((a, b) => a - b);
  let closest = keys[0];
  for (const key of keys) {
    if (Math.abs(key - rating) < Math.abs(closest - rating)) {
      closest = key;
    }
  }
  return RATING_LABELS[closest];
}

export function getRatingColor(rating: number): string {
  if (rating <= 1) return '#d32f2f';
  if (rating <= 3) return '#e65100';
  if (rating <= 5) return '#f9a825';
  if (rating <= 7) return '#8bc34a';
  if (rating <= 9) return '#4caf50';
  return '#2e7d32';
}
