// Run: npx tsx scripts/enrich-google.ts <email> <password>
// Enriches all restaurants with Google Places data (photos, phone, website, coordinates, menu, etc.)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wzkhldndkxnkprskazie.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2hsZG5ka3hua3Byc2themllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjIzMzksImV4cCI6MjA4OTYzODMzOX0.I8vwoYCQ6z7AKvW3eGPOi5ByGFecPchZVwVw2rgwQuw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// LA normalization
const LA_AREA_CITIES = new Set([
  'west hollywood','hollywood','beverly hills','santa monica','culver city',
  'venice','silver lake','echo park','los feliz','koreatown','brentwood',
  'westwood','century city','marina del rey','pacific palisades',
  'north hollywood','burbank','glendale','pasadena','south pasadena',
  'eagle rock','highland park','atwater village','studio city','sherman oaks',
  'encino','tarzana','van nuys','woodland hills','canoga park','chatsworth',
  'northridge','granada hills','calabasas','malibu','inglewood',
  'el segundo','manhattan beach','hermosa beach','redondo beach','torrance',
  'hawthorne','gardena','carson','compton','long beach','downey','whittier',
  'alhambra','monterey park','san gabriel','arcadia','monrovia',
]);

async function searchGooglePlace(name: string, address: string, apiKey: string) {
  const query = `${name} ${address}`;
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${apiKey}`
  );
  const data = await res.json();
  const place = data.results?.[0];
  if (!place) return null;

  // Get details
  let details: any = {};
  try {
    const detailRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,url,photos,price_level,rating,types,geometry,editorial_summary,address_components&key=${apiKey}`
    );
    const detailData = await detailRes.json();
    details = detailData.result || {};
  } catch {}

  const photoRef = place.photos?.[0]?.photo_reference;
  const imageUrl = photoRef
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${apiKey}`
    : '';

  // Get additional photos
  const photos: string[] = [];
  if (details.photos) {
    for (const p of details.photos.slice(0, 5)) {
      photos.push(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${p.photo_reference}&key=${apiKey}`);
    }
  }

  // Extract city from address_components
  let city = '';
  let state = '';
  if (details.address_components) {
    for (const comp of details.address_components) {
      if (comp.types?.includes('locality')) city = comp.long_name;
      if (comp.types?.includes('administrative_area_level_1')) state = comp.short_name;
    }
  }
  if (state === 'CA' && LA_AREA_CITIES.has(city.toLowerCase())) city = 'Los Angeles';

  // Cuisine tags from types
  const typeMap: Record<string, string> = {
    chinese_restaurant: 'Chinese', italian_restaurant: 'Italian',
    japanese_restaurant: 'Japanese', mexican_restaurant: 'Mexican',
    indian_restaurant: 'Indian', thai_restaurant: 'Thai',
    french_restaurant: 'French', korean_restaurant: 'Korean',
    vietnamese_restaurant: 'Vietnamese', mediterranean_restaurant: 'Mediterranean',
    pizza_restaurant: 'Pizza', seafood_restaurant: 'Seafood',
    steak_house: 'Steakhouse', sushi_restaurant: 'Sushi',
    barbecue_restaurant: 'BBQ', cafe: 'Cafe', bakery: 'Bakery', bar: 'Bar',
  };

  const allTypes = [...(details.types || []), ...(place.types || [])];
  const cuisineTags = [...new Set(allTypes.filter((t: string) => typeMap[t]).map((t: string) => typeMap[t]))];

  // Keyword matching
  const summary = (details.editorial_summary?.overview || '').toLowerCase();
  const nameAndSummary = `${name} ${summary}`.toLowerCase();
  const cuisineKeywords: Record<string, string> = {
    'italian': 'Italian', 'pizza': 'Pizza', 'chinese': 'Chinese',
    'japanese': 'Japanese', 'sushi': 'Sushi', 'ramen': 'Japanese',
    'mexican': 'Mexican', 'taco': 'Mexican', 'indian': 'Indian',
    'thai': 'Thai', 'french': 'French', 'korean': 'Korean',
    'vietnamese': 'Vietnamese', 'pho': 'Vietnamese',
    'mediterranean': 'Mediterranean', 'greek': 'Greek',
    'seafood': 'Seafood', 'steakhouse': 'Steakhouse',
    'ethiopian': 'Ethiopian', 'middle eastern': 'Middle Eastern',
    'vegan': 'Vegan', 'vegetarian': 'Vegetarian',
  };

  for (const [keyword, tag] of Object.entries(cuisineKeywords)) {
    if (nameAndSummary.includes(keyword) && !cuisineTags.includes(tag)) {
      cuisineTags.push(tag);
    }
  }

  const priceMap: Record<number, string> = { 0: '$', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
  const googleUrl = details.url || '';

  return {
    phone: details.formatted_phone_number || '',
    website: details.website || '',
    google_url: googleUrl,
    menu_url: googleUrl ? `${googleUrl.replace(/\/$/, '')}/menu` : '',
    image_url: imageUrl,
    photos,
    price_level: priceMap[details.price_level ?? place.price_level] || '',
    latitude: place.geometry?.location?.lat || null,
    longitude: place.geometry?.location?.lng || null,
    ...(city ? { city } : {}),
    ...(cuisineTags.length > 0 ? { cuisine_tags: cuisineTags } : {}),
  };
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const startFrom = parseInt(process.argv[4] || '0');

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/enrich-google.ts <email> <password> [startIndex]');
    process.exit(1);
  }

  // Get API key from Supabase secrets — we'll call the edge function instead
  // Actually, let's just use the edge function to avoid exposing the key
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) { console.error('Auth failed:', authError.message); process.exit(1); }
  console.log('Logged in');

  // Get all restaurants
  const { data: restaurants, error: rError } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: true });

  if (rError || !restaurants) {
    console.error('Failed to get restaurants:', rError?.message);
    process.exit(1);
  }

  console.log(`Found ${restaurants.length} restaurants total, starting from index ${startFrom}`);

  const EDGE_URL = `${SUPABASE_URL}/functions/v1/search-restaurants`;

  let enriched = 0;
  let failed = 0;

  for (let i = startFrom; i < restaurants.length; i++) {
    const r = restaurants[i];

    // Skip if already enriched (has google_url)
    if (r.google_url) {
      console.log(`  ${i + 1}. ${r.name} — already enriched, skipping`);
      enriched++;
      continue;
    }

    const searchQuery = r.name;
    const location = r.city ? `${r.city}, ${r.state || ''}` : '';

    try {
      // Call edge function via raw fetch with explicit auth
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ query: searchQuery, provider: 'google', location }),
      });

      if (!res.ok) {
        console.error(`  ${i + 1}. ${r.name} — HTTP ${res.status}: ${await res.text()}`);
        failed++;
        continue;
      }

      const data = await res.json();
      const results = data?.results || [];
      if (results.length === 0) {
        console.error(`  ${i + 1}. ${r.name} — no results found`);
        failed++;
        continue;
      }

      // Find best match by name similarity
      const best = results.find((res: any) =>
        res.name.toLowerCase().includes(r.name.toLowerCase().split(' ')[0]) ||
        r.name.toLowerCase().includes(res.name.toLowerCase().split(' ')[0])
      ) || results[0];

      // Update restaurant with enriched data
      const updates: any = {};
      if (best.phone && !r.phone) updates.phone = best.phone;
      if (best.website && !r.website) updates.website = best.website;
      if (best.google_url) updates.google_url = best.google_url;
      if (best.google_url) updates.menu_url = `${best.google_url.replace(/\/$/, '')}/menu`;
      if (best.image_url && !r.image_url) updates.image_url = best.image_url;
      if (best.photos?.length > 0) updates.photos = best.photos;
      if (best.price_level && !r.price_level) updates.price_level = best.price_level;
      if (best.latitude && !r.latitude) updates.latitude = best.latitude;
      if (best.longitude && !r.longitude) updates.longitude = best.longitude;
      if (best.cuisine_tags?.length > 0) {
        // Merge cuisine tags
        const merged = [...new Set([...(r.cuisine_tags || []), ...best.cuisine_tags])];
        updates.cuisine_tags = merged;
      }

      if (Object.keys(updates).length > 0) {
        const { error: uError } = await supabase
          .from('restaurants')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', r.id);

        if (uError) {
          console.error(`  ${i + 1}. ${r.name} — update error: ${uError.message}`);
          failed++;
        } else {
          enriched++;
          console.log(`  ${i + 1}. ${r.name} ✓ (${best.name}) — phone:${updates.phone ? '✓' : '-'} web:${updates.website ? '✓' : '-'} map:${updates.google_url ? '✓' : '-'} img:${updates.image_url ? '✓' : '-'} coords:${updates.latitude ? '✓' : '-'}`);
        }
      } else {
        console.log(`  ${i + 1}. ${r.name} — nothing to update`);
      }

      // Rate limit: 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (err: any) {
      console.error(`  ${i + 1}. ${r.name} — error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Enriched: ${enriched}, Failed: ${failed}`);
}

main().catch(console.error);
