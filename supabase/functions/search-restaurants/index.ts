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
    const { query, provider, location } = await req.json();

    if (provider === 'yelp') {
      return await searchYelp(query, location);
    } else {
      return await searchGoogle(query, location);
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function searchYelp(query: string, location?: string) {
  const apiKey = Deno.env.get('YELP_API_KEY');
  if (!apiKey) throw new Error('YELP_API_KEY not configured');

  const params = new URLSearchParams({
    term: query,
    location: location || 'New York',
    limit: '10',
    categories: 'restaurants,food',
  });

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

async function searchGoogle(query: string, location?: string) {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const searchQuery = `${query} restaurant ${location || ''}`.trim();
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=restaurant&key=${apiKey}`
  );

  const data = await res.json();

  const results = await Promise.all(
    (data.results || []).slice(0, 10).map(async (place: any) => {
      // Get details for each place
      let details: any = {};
      try {
        const detailRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,url,photos,price_level,rating,types,geometry&key=${apiKey}`
        );
        const detailData = await detailRes.json();
        details = detailData.result || {};
      } catch { /* use basic info */ }

      const photoRef = place.photos?.[0]?.photo_reference;
      const imageUrl = photoRef
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${apiKey}`
        : '';

      // Extract city from address components or formatted address
      const addressParts = (details.formatted_address || place.formatted_address || '').split(',');
      const city = addressParts.length >= 2 ? addressParts[addressParts.length - 2]?.trim() : '';

      // Map Google types to cuisine tags
      const typeMap: Record<string, string> = {
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
        cafe: 'Cafe',
        bakery: 'Bakery',
      };

      const cuisineTags = (details.types || place.types || [])
        .filter((t: string) => typeMap[t])
        .map((t: string) => typeMap[t]);

      const priceMap: Record<number, string> = { 0: '$', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };

      return {
        id: place.place_id,
        name: place.name,
        address: details.formatted_address || place.formatted_address || '',
        city,
        state: '',
        country: '',
        phone: details.formatted_phone_number || '',
        website: details.website || '',
        yelp_url: '',
        google_url: details.url || '',
        menu_url: '',
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
