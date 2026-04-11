// Supabase Edge Function: Search Restaurants via Yelp or Google Places
// Deploy: supabase functions deploy search-restaurants
// Required secrets: YELP_API_KEY, GOOGLE_PLACES_API_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, provider, location, latitude, longitude } = await req.json();

    if (provider === 'yelp') {
      return await searchYelp(query, location, latitude, longitude);
    } else {
      return await searchGoogle(query, location, latitude, longitude);
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function searchYelp(query: string, location?: string, latitude?: number, longitude?: number) {
  const apiKey = Deno.env.get('YELP_API_KEY');
  if (!apiKey) throw new Error('YELP_API_KEY not configured');

  const params = new URLSearchParams({
    term: query,
    limit: '10',
    categories: 'restaurants,food',
  });

  // Prefer precise coordinates; fall back to city string
  if (latitude != null && longitude != null) {
    params.set('latitude', String(latitude));
    params.set('longitude', String(longitude));
  } else {
    params.set('location', location || 'New York');
  }

  const res = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const data = await res.json();

  const results = (data.businesses || []).map((b: any) => ({
    id: b.id,
    name: b.name,
    address: b.location?.display_address?.join(', ') || '',
    city: b.location?.city || '',
    state: b.location?.state || '',
    country: b.location?.country || '',
    phone: b.display_phone || '',
    website: b.url || '',
    yelp_url: b.url || '',
    google_url: '',
    menu_url: '',
    image_url: b.image_url || '',
    photos: b.photos || [],
    price_level: b.price || '',
    rating: b.rating || null,
    cuisine_tags: (b.categories || []).map((c: any) => c.title),
    latitude: b.coordinates?.latitude || null,
    longitude: b.coordinates?.longitude || null,
  }));

  return new Response(
    JSON.stringify({ results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function searchGoogle(query: string, location?: string, latitude?: number, longitude?: number) {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const searchQuery = `${query} restaurant ${location || ''}`.trim();
  let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=restaurant&key=${apiKey}`;

  // Bias results toward user's GPS location (50 km radius)
  if (latitude != null && longitude != null) {
    url += `&location=${latitude},${longitude}&radius=50000`;
  }

  const res = await fetch(url);

  const data = await res.json();

  const results = await Promise.all(
    (data.results || []).slice(0, 10).map(async (place: any) => {
      // Get details with editorial_summary for better cuisine detection
      let details: any = {};
      try {
        const detailRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,url,photos,price_level,rating,types,geometry,editorial_summary,address_components&key=${apiKey}`
        );
        const detailData = await detailRes.json();
        details = detailData.result || {};
      } catch { /* use basic info */ }

      const photoRef = place.photos?.[0]?.photo_reference;
      const imageUrl = photoRef
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${apiKey}`
        : '';

      // Extract city and state from address_components
      let city = '';
      let state = '';
      if (details.address_components) {
        for (const comp of details.address_components) {
          if (comp.types?.includes('locality')) city = comp.long_name;
          if (comp.types?.includes('administrative_area_level_1')) state = comp.short_name;
        }
      }
      // Normalize LA-area cities
      if (state === 'CA') {
        const laAreaCities = new Set([
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
        if (laAreaCities.has(city.toLowerCase())) city = 'Los Angeles';
      }
      // Fallback: parse from formatted address
      if (!city) {
        const addressParts = (details.formatted_address || place.formatted_address || '').split(',');
        city = addressParts.length >= 3 ? addressParts[addressParts.length - 3]?.trim() :
               addressParts.length >= 2 ? addressParts[addressParts.length - 2]?.trim() : '';
      }

      // Map Google types to cuisine tags — both old and new API format
      const typeMap: Record<string, string> = {
        // New Places API types (with underscores)
        chinese_restaurant: 'Chinese',
        italian_restaurant: 'Italian',
        japanese_restaurant: 'Japanese',
        mexican_restaurant: 'Mexican',
        indian_restaurant: 'Indian',
        thai_restaurant: 'Thai',
        french_restaurant: 'French',
        korean_restaurant: 'Korean',
        vietnamese_restaurant: 'Vietnamese',
        mediterranean_restaurant: 'Mediterranean',
        pizza_restaurant: 'Pizza',
        seafood_restaurant: 'Seafood',
        steak_house: 'Steakhouse',
        sushi_restaurant: 'Sushi',
        barbecue_restaurant: 'BBQ',
        // Common types from text search
        cafe: 'Cafe',
        bakery: 'Bakery',
        bar: 'Bar',
        meal_delivery: 'Delivery',
        meal_takeaway: 'Takeout',
      };

      const allTypes = [...(details.types || []), ...(place.types || [])];
      const cuisineTags = [...new Set(
        allTypes
          .filter((t: string) => typeMap[t])
          .map((t: string) => typeMap[t])
      )];

      // Also try to extract cuisine from the editorial summary or name
      const summary = (details.editorial_summary?.overview || '').toLowerCase();
      const nameAndSummary = `${place.name} ${summary}`.toLowerCase();

      const cuisineKeywords: Record<string, string> = {
        'italian': 'Italian', 'pizza': 'Pizza', 'pasta': 'Italian',
        'chinese': 'Chinese', 'dim sum': 'Chinese',
        'japanese': 'Japanese', 'sushi': 'Sushi', 'ramen': 'Japanese',
        'mexican': 'Mexican', 'taco': 'Mexican', 'burrito': 'Mexican',
        'indian': 'Indian', 'curry': 'Indian', 'tandoori': 'Indian',
        'thai': 'Thai', 'pad thai': 'Thai',
        'french': 'French', 'bistro': 'French',
        'korean': 'Korean', 'bbq': 'BBQ', 'barbecue': 'BBQ',
        'vietnamese': 'Vietnamese', 'pho': 'Vietnamese',
        'mediterranean': 'Mediterranean', 'greek': 'Greek',
        'seafood': 'Seafood', 'steakhouse': 'Steakhouse', 'steak': 'Steakhouse',
        'burger': 'American', 'american': 'American',
        'spanish': 'Spanish', 'tapas': 'Spanish',
        'peruvian': 'Peruvian', 'brazilian': 'Brazilian',
        'ethiopian': 'Ethiopian', 'middle eastern': 'Middle Eastern',
        'turkish': 'Turkish', 'lebanese': 'Lebanese',
        'cajun': 'Cajun', 'soul food': 'Soul Food',
        'vegan': 'Vegan', 'vegetarian': 'Vegetarian',
        'brunch': 'Brunch', 'breakfast': 'Breakfast',
        'dessert': 'Dessert', 'bakery': 'Bakery',
        'coffee': 'Coffee', 'cafe': 'Cafe',
      };

      for (const [keyword, tag] of Object.entries(cuisineKeywords)) {
        if (nameAndSummary.includes(keyword) && !cuisineTags.includes(tag)) {
          cuisineTags.push(tag);
        }
      }

      const priceMap: Record<number, string> = { 0: '$', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };

      return {
        id: place.place_id,
        name: place.name,
        address: details.formatted_address || place.formatted_address || '',
        city,
        state,
        country: '',
        phone: details.formatted_phone_number || '',
        website: details.website || '',
        yelp_url: '',
        google_url: details.url || '',
        menu_url: details.url ? `${details.url.replace(/\/$/, '')}/menu` : '',
        image_url: imageUrl,
        photos: [],
        price_level: priceMap[details.price_level ?? place.price_level] || '',
        rating: details.rating || place.rating || null,
        cuisine_tags: cuisineTags.length > 0 ? cuisineTags : ['Restaurant'],
        latitude: place.geometry?.location?.lat || null,
        longitude: place.geometry?.location?.lng || null,
      };
    })
  );

  return new Response(
    JSON.stringify({ results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
