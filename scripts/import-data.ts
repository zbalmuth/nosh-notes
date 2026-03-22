// Run: npx tsx scripts/import-data.ts
// Imports restaurant data from the text file into Supabase

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = 'https://wzkhldndkxnkprskazie.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2hsZG5ka3hua3Byc2themllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjIzMzksImV4cCI6MjA4OTYzODMzOX0.I8vwoYCQ6z7AKvW3eGPOi5ByGFecPchZVwVw2rgwQuw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Rating mapping: if a dish has a numeric /10 rating, use it directly.
// If no rating, map by category:
//   Good = 6.0, Ok = 4.0, Want to Try = want_to_try flag
const CATEGORY_DEFAULT_RATING: Record<string, number | null> = {
  'good': 6.0,
  'ok': 4.0,
  'bad': 2.0,
  'want_to_try': null,
};

interface ParsedDish {
  name: string;
  rating: number | null;
  want_to_try: boolean;
  notes: string;
  dish_type: string;
}

interface ParsedRestaurant {
  name: string;
  address: string;
  city: string;
  state: string;
  cuisine_tags: string[];
  dishes: ParsedDish[];
}

// LA-area cities that should be normalized to "Los Angeles"
const LA_AREA_CITIES = new Set([
  'west hollywood', 'east hollywood', 'hollywood', 'beverly hills',
  'santa monica', 'culver city', 'venice', 'silver lake', 'echo park',
  'los feliz', 'koreatown', 'mid-wilshire', 'miracle mile',
  'hancock park', 'larchmont', 'fairfax', 'melrose', 'brentwood',
  'westwood', 'century city', 'mar vista', 'del rey', 'playa del rey',
  'playa vista', 'marina del rey', 'pacific palisades', 'malibu',
  'calabasas', 'encino', 'tarzana', 'sherman oaks', 'studio city',
  'north hollywood', 'burbank', 'glendale', 'pasadena', 'south pasadena',
  'eagle rock', 'highland park', 'atwater village', 'glassell park',
  'downtown los angeles', 'dtla', 'arts district', 'little tokyo',
  'chinatown', 'el sereno', 'lincoln heights', 'boyle heights',
  'east los angeles', 'west los angeles', 'westchester', 'inglewood',
  'hawthorne', 'gardena', 'torrance', 'redondo beach', 'hermosa beach',
  'manhattan beach', 'el segundo', 'lawndale', 'lomita', 'san pedro',
  'wilmington', 'carson', 'compton', 'long beach', 'lakewood',
  'downey', 'whittier', 'montebello', 'alhambra', 'monterey park',
  'san gabriel', 'temple city', 'arcadia', 'monrovia', 'duarte',
  'la cañada flintridge', 'la crescenta', 'sunland', 'tujunga',
  'pacoima', 'sylmar', 'van nuys', 'panorama city', 'reseda',
  'canoga park', 'woodland hills', 'chatsworth', 'northridge',
  'granada hills', 'porter ranch', 'west hills',
]);

function normalizeCity(city: string, state: string): string {
  if (state === 'CA' && LA_AREA_CITIES.has(city.toLowerCase())) {
    return 'Los Angeles';
  }
  return city;
}

function parseAddress(addrLine: string): { address: string; city: string; state: string } {
  // Remove emoji prefix
  const addr = addrLine.replace(/^📍\s*/, '').trim();

  // Try to parse: "123 Street, City, ST ZIP, Country" or "123 Street, City, ST ZIP"
  const parts = addr.split(',').map(s => s.trim());

  if (parts.length >= 3) {
    const address = parts[0];
    let city = parts[parts.length >= 4 ? parts.length - 3 : 1] || '';
    // State is usually in "ST ZIP" format
    const stateZipPart = parts[parts.length >= 4 ? parts.length - 2 : 2] || '';
    const stateMatch = stateZipPart.match(/^([A-Z]{2})\s/);
    const state = stateMatch ? stateMatch[1] : stateZipPart.replace(/\d+/g, '').trim();
    city = normalizeCity(city, state);
    return { address: addr, city, state };
  }

  return { address: addr, city: '', state: '' };
}

function parseCuisines(line: string): string[] {
  const cleaned = line.replace(/^🍽️\s*/, '').trim();
  return cleaned.split(',').map(s => s.trim()).filter(Boolean);
}

function parseDishLine(line: string, category: string): ParsedDish {
  // Remove bullet point
  let text = line.replace(/^\s*[•\-]\s*/, '').trim();

  // Extract rating if present: "Dish name - 7/10" or "Dish name - 7/10 - notes"
  let rating: number | null = null;
  let want_to_try = category === 'want_to_try';
  let notes = '';

  const ratingMatch = text.match(/\s*-\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1]);
    // Remove the rating from text
    const idx = text.indexOf(ratingMatch[0]);
    const before = text.substring(0, idx).trim();
    const after = text.substring(idx + ratingMatch[0].length).replace(/^\s*-?\s*/, '').trim();
    text = before;
    if (after) notes = after;
  } else if (!want_to_try) {
    // No explicit rating — use category default
    rating = CATEGORY_DEFAULT_RATING[category] ?? null;

    // Check if there's a note after a dash
    const dashIdx = text.indexOf(' - ');
    if (dashIdx > 0) {
      notes = text.substring(dashIdx + 3).trim();
      text = text.substring(0, dashIdx).trim();
    }
  } else {
    // Want to try — no rating
    const dashIdx = text.indexOf(' - ');
    if (dashIdx > 0) {
      notes = text.substring(dashIdx + 3).trim();
      text = text.substring(0, dashIdx).trim();
    }
  }

  return {
    name: text,
    rating: want_to_try ? null : rating,
    want_to_try,
    notes,
    dish_type: 'entree', // Default
  };
}

function parseRestaurants(content: string): ParsedRestaurant[] {
  const blocks = content.split(/\n---\n/).map(b => b.trim()).filter(Boolean);
  const restaurants: ParsedRestaurant[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const name = lines[0];
    let address = '', city = '', state = '';
    let cuisine_tags: string[] = [];
    const dishes: ParsedDish[] = [];

    let currentCategory = '';

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('📍')) {
        const parsed = parseAddress(line);
        address = parsed.address;
        city = parsed.city;
        state = parsed.state;
      } else if (line.startsWith('🍽️')) {
        cuisine_tags = parseCuisines(line);
      } else if (line.match(/^✅\s*Good/i)) {
        currentCategory = 'good';
      } else if (line.match(/^⚠️\s*Ok/i)) {
        currentCategory = 'ok';
      } else if (line.match(/^❌\s*Bad/i) || line.match(/^👎/i)) {
        currentCategory = 'bad';
      } else if (line.match(/^📝\s*Want to Try/i) || line.match(/^🔜/i)) {
        currentCategory = 'want_to_try';
      } else if (line.match(/^\s*[•\-]\s+/) && currentCategory) {
        dishes.push(parseDishLine(line, currentCategory));
      }
    }

    restaurants.push({ name, address, city, state, cuisine_tags, dishes });
  }

  return restaurants;
}

async function main() {
  // First, sign in
  console.log('Please provide your email and password:');
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/import-data.ts <email> <password> [limit]');
    process.exit(1);
  }

  const limit = parseInt(process.argv[4] || '10');

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    console.error('Auth failed:', authError.message);
    process.exit(1);
  }

  const userId = authData.user?.id;
  console.log(`Logged in as ${userId}`);

  // Ensure "My Restaurants" list exists
  const { data: existingLists } = await supabase.from('lists').select('*');
  if (!existingLists || existingLists.length === 0) {
    await supabase.from('lists').insert({ name: 'My Restaurants', user_id: userId });
    console.log('Created "My Restaurants" list');
  }

  // Read and parse
  const content = fs.readFileSync('C:/Users/zbalm/Downloads/Restaurant data.txt', 'utf-8');
  const allRestaurants = parseRestaurants(content);
  console.log(`Parsed ${allRestaurants.length} restaurants total, importing first ${limit}`);

  const toImport = allRestaurants.slice(0, limit);

  for (const r of toImport) {
    console.log(`\nImporting: ${r.name}`);
    console.log(`  Address: ${r.address}`);
    console.log(`  City: ${r.city}, State: ${r.state}`);
    console.log(`  Cuisines: ${r.cuisine_tags.join(', ')}`);
    console.log(`  Dishes: ${r.dishes.length}`);

    // Insert restaurant
    const { data: restaurant, error: rError } = await supabase
      .from('restaurants')
      .insert({
        user_id: userId,
        name: r.name,
        address: r.address,
        city: r.city,
        state: r.state,
        cuisine_tags: r.cuisine_tags,
        lists: ['My Restaurants'],
        is_favorite: false,
      })
      .select()
      .single();

    if (rError) {
      console.error(`  ERROR inserting restaurant: ${rError.message}`);
      continue;
    }

    console.log(`  Restaurant ID: ${restaurant.id}`);

    // Insert dishes
    for (const dish of r.dishes) {
      const { error: dError } = await supabase
        .from('dishes')
        .insert({
          user_id: userId,
          restaurant_id: restaurant.id,
          name: dish.name,
          dish_type: dish.dish_type,
          rating: dish.rating,
          want_to_try: dish.want_to_try,
          notes: dish.notes,
          photos: [],
        });

      if (dError) {
        console.error(`    ERROR inserting dish "${dish.name}": ${dError.message}`);
      } else {
        const ratingStr = dish.want_to_try ? '✨ Want to Try' : `${dish.rating?.toFixed(1) || 'N/A'}/10`;
        console.log(`    ✓ ${dish.name} (${ratingStr}${dish.notes ? ` - ${dish.notes}` : ''})`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
