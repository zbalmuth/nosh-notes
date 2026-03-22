// Run: npx tsx scripts/import-all.ts
// Deletes all existing data, then re-imports everything

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = 'https://wzkhldndkxnkprskazie.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2hsZG5ka3hua3Byc2themllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjIzMzksImV4cCI6MjA4OTYzODMzOX0.I8vwoYCQ6z7AKvW3eGPOi5ByGFecPchZVwVw2rgwQuw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
]);

function normalizeCity(city: string, state: string): string {
  if (state === 'CA' && LA_AREA_CITIES.has(city.toLowerCase())) return 'Los Angeles';
  return city;
}

function parseAddress(addrLine: string): { address: string; city: string; state: string } {
  const addr = addrLine.replace(/^📍\s*/, '').trim();
  const parts = addr.split(',').map(s => s.trim());
  if (parts.length >= 3) {
    // Find the state+zip part (e.g. "CA 90048") — scan from the end
    let stateIdx = -1;
    for (let i = parts.length - 1; i >= 1; i--) {
      if (/^[A-Z]{2}\s+\d{5}/.test(parts[i]) || /^[A-Z]{2}$/.test(parts[i])) {
        stateIdx = i;
        break;
      }
    }
    if (stateIdx === -1) stateIdx = parts.length - 1;
    const stateZipPart = parts[stateIdx];
    const stateMatch = stateZipPart.match(/^([A-Z]{2})/);
    const state = stateMatch ? stateMatch[1] : stateZipPart.replace(/\d+/g, '').trim();
    // City is right before the state part, skipping suite/unit/bldg parts
    let city = '';
    for (let i = stateIdx - 1; i >= 1; i--) {
      if (!/^(ste|suite|unit|bldg|apt|#)\s/i.test(parts[i]) && !/^\d+$/.test(parts[i])) {
        city = parts[i];
        break;
      }
    }
    city = normalizeCity(city, state);
    return { address: addr, city, state };
  }
  return { address: addr, city: '', state: '' };
}

function parseCuisines(line: string): string[] {
  return line.replace(/^🍽️\s*/, '').trim().split(',').map(s => s.trim()).filter(Boolean);
}

const CATEGORY_DEFAULT_RATING: Record<string, number | null> = {
  'good': 6.0, 'ok': 4.0, 'bad': 2.0, 'want_to_try': null,
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

function parseDishLine(line: string, category: string): ParsedDish {
  let text = line.replace(/^\s*[•\-]\s*/, '').trim();
  let rating: number | null = null;
  let want_to_try = category === 'want_to_try';
  let notes = '';

  const ratingMatch = text.match(/\s*-\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1]);
    const idx = text.indexOf(ratingMatch[0]);
    const before = text.substring(0, idx).trim();
    const after = text.substring(idx + ratingMatch[0].length).replace(/^\s*-?\s*/, '').trim();
    text = before;
    if (after) notes = after;
  } else if (!want_to_try) {
    rating = CATEGORY_DEFAULT_RATING[category] ?? null;
    const dashIdx = text.indexOf(' - ');
    if (dashIdx > 0) { notes = text.substring(dashIdx + 3).trim(); text = text.substring(0, dashIdx).trim(); }
  } else {
    const dashIdx = text.indexOf(' - ');
    if (dashIdx > 0) { notes = text.substring(dashIdx + 3).trim(); text = text.substring(0, dashIdx).trim(); }
  }

  return { name: text, rating: want_to_try ? null : rating, want_to_try, notes, dish_type: 'entree' };
}

function parseRestaurantsWithDishes(content: string): ParsedRestaurant[] {
  const blocks = content.split(/\r?\n---\r?\n/).map(b => b.trim()).filter(Boolean);
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
        address = parsed.address; city = parsed.city; state = parsed.state;
      } else if (line.startsWith('🍽️')) {
        cuisine_tags = parseCuisines(line);
      } else if (line.match(/^✅\s*Good/i)) { currentCategory = 'good'; }
      else if (line.match(/^⚠️\s*Ok/i)) { currentCategory = 'ok'; }
      else if (line.match(/^❌\s*Bad/i) || line.match(/^👎/i)) { currentCategory = 'bad'; }
      else if (line.match(/^📝\s*Want to Try/i) || line.match(/^🔜/i)) { currentCategory = 'want_to_try'; }
      else if (line.match(/^\s*[•\-]\s+/) && currentCategory) {
        dishes.push(parseDishLine(line, currentCategory));
      }
    }

    restaurants.push({ name, address, city, state, cuisine_tags, dishes });
  }

  return restaurants;
}

function parseSimpleRestaurants(content: string): ParsedRestaurant[] {
  const blocks = content.split(/\r?\n---\r?\n/).map(b => b.trim()).filter(Boolean);
  const restaurants: ParsedRestaurant[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const name = lines[0];
    let address = '', city = '', state = '';
    let cuisine_tags: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('📍')) {
        const parsed = parseAddress(line);
        address = parsed.address; city = parsed.city; state = parsed.state;
      } else if (line.startsWith('🍽️')) {
        cuisine_tags = parseCuisines(line);
      }
    }

    restaurants.push({ name, address, city, state, cuisine_tags, dishes: [] });
  }

  return restaurants;
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/import-all.ts <email> <password>');
    process.exit(1);
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) { console.error('Auth failed:', authError.message); process.exit(1); }

  const userId = authData.user?.id;
  console.log(`Logged in as ${userId}`);

  // ───── STEP 1: Delete everything ─────
  console.log('\n=== Deleting all existing data ===');

  const { data: existingRestaurants } = await supabase.from('restaurants').select('id');
  if (existingRestaurants && existingRestaurants.length > 0) {
    // Delete all dishes first
    for (const r of existingRestaurants) {
      await supabase.from('dishes').delete().eq('restaurant_id', r.id);
    }
    console.log(`Deleted dishes for ${existingRestaurants.length} restaurants`);

    // Delete all restaurants
    const { error: delError } = await supabase.from('restaurants').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delError) console.error('Error deleting restaurants:', delError.message);
    else console.log(`Deleted ${existingRestaurants.length} restaurants`);
  }

  // Delete all lists
  await supabase.from('lists').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('Deleted all lists');

  // ───── STEP 2: Create lists ─────
  console.log('\n=== Creating lists ===');
  await supabase.from('lists').insert({ name: 'My Restaurants', user_id: userId });
  console.log('Created "My Restaurants"');
  await supabase.from('lists').insert({ name: 'Want to Try', user_id: userId });
  console.log('Created "Want to Try"');

  // ───── STEP 3: Import "My Restaurants" ─────
  console.log('\n=== Importing My Restaurants ===');
  const mainContent = fs.readFileSync('C:/Users/zbalm/Downloads/Restaurant data.txt', 'utf-8');
  const mainRestaurants = parseRestaurantsWithDishes(mainContent);
  console.log(`Parsed ${mainRestaurants.length} restaurants from Restaurant data.txt`);

  let importedMain = 0;
  let totalDishes = 0;
  for (const r of mainRestaurants) {
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
      console.error(`  ERROR: ${r.name}: ${rError.message}`);
      continue;
    }

    importedMain++;
    process.stdout.write(`  ${importedMain}. ${r.name} (${r.city}) - ${r.dishes.length} dishes`);

    for (const dish of r.dishes) {
      const { error: dError } = await supabase.from('dishes').insert({
        user_id: userId,
        restaurant_id: restaurant.id,
        name: dish.name,
        dish_type: dish.dish_type,
        rating: dish.rating,
        want_to_try: dish.want_to_try,
        notes: dish.notes,
        photos: [],
      });
      if (dError) console.error(`\n    DISH ERROR: ${dish.name}: ${dError.message}`);
      else totalDishes++;
    }

    console.log(' ✓');
  }

  console.log(`\nImported ${importedMain} restaurants with ${totalDishes} dishes to "My Restaurants"`);

  // ───── STEP 4: Import "Want to Try" ─────
  console.log('\n=== Importing Want to Try ===');
  const wantContent = fs.readFileSync('C:/Users/zbalm/Downloads/Want to try.txt', 'utf-8');
  const wantRestaurants = parseSimpleRestaurants(wantContent);
  console.log(`Parsed ${wantRestaurants.length} restaurants from Want to try.txt`);

  let importedWant = 0;
  for (const r of wantRestaurants) {
    const { data: restaurant, error: rError } = await supabase
      .from('restaurants')
      .insert({
        user_id: userId,
        name: r.name,
        address: r.address,
        city: r.city,
        state: r.state,
        cuisine_tags: r.cuisine_tags,
        lists: ['Want to Try'],
        is_favorite: false,
      })
      .select()
      .single();

    if (rError) {
      console.error(`  ERROR: ${r.name}: ${rError.message}`);
      continue;
    }

    importedWant++;
    console.log(`  ${importedWant}. ${r.name} (${r.city}) ✓`);
  }

  console.log(`\nImported ${importedWant} restaurants to "Want to Try"`);
  console.log(`\n=== DONE === Total: ${importedMain + importedWant} restaurants, ${totalDishes} dishes`);
}

main().catch(console.error);
