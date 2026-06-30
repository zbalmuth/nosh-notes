// Supabase Edge Function: Place Details (photos + hours) for one restaurant.
// Called lazily when a search result's detail dialog is opened, so the list
// search itself stays fast.
// Deploy: supabase functions deploy place-details
// Required secrets: YELP_API_KEY, GOOGLE_PLACES_API_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const EMPTY = { photos: [], hours: null, menu_url: '', website: '', phone: '', highlights: '' };

// Google Maps "highlights" (must-order dishes / vibe) only exist as the Places
// API (New) AI place summary — there is no structured top-dishes field. This
// hits the v1 endpoint; if the project hasn't enabled "Places API (New)" it
// 403s and we just return '' (the dialog hides the section).
async function googleHighlights(placeId: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'generativeSummary.overview,editorialSummary',
      },
    });
    if (!res.ok) return '';
    const d = await res.json();
    return d.generativeSummary?.overview?.text || d.editorialSummary?.text || '';
  } catch {
    return '';
  }
}

async function requireAuth(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ...EMPTY, warning: 'Authentication required.' }, 401);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: supabaseAnonKey },
  });
  if (!res.ok) return json({ ...EMPTY, warning: 'Authentication required.' }, 401);
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  try {
    const { id, provider } = await req.json();
    if (!id) return json(EMPTY);
    return provider === 'yelp' ? await yelpDetails(id) : await googleDetails(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('place-details top-level error:', message);
    return json({ ...EMPTY, warning: message });
  }
});

// ── Google Places ────────────────────────────────────────────────────────────
async function googleDetails(placeId: string) {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}` +
      `&fields=photos,opening_hours,website,formatted_phone_number,url&key=${apiKey}`
  );
  if (!res.ok) {
    console.error('Google details error:', res.status, await res.text());
    return json(EMPTY);
  }
  const data = await res.json();
  const r = data.result || {};

  // Resolve up to 8 photo references to their CDN URLs (no API key exposed).
  const refs: string[] = (r.photos || [])
    .slice(0, 8)
    .map((p: { photo_reference: string }) => p.photo_reference)
    .filter(Boolean);

  // Resolve photos and fetch the AI highlights summary concurrently.
  const [photos, highlights] = await Promise.all([
    Promise.all(
      refs.map(async (ref) => {
        try {
          const photoRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${apiKey}`
          );
          return photoRes.url;
        } catch {
          return '';
        }
      })
    ).then((urls) => urls.filter(Boolean)),
    googleHighlights(placeId, apiKey),
  ]);

  const hours = r.opening_hours
    ? { open_now: r.opening_hours.open_now, weekday_text: r.opening_hours.weekday_text || [] }
    : null;

  return json({
    photos,
    hours,
    highlights,
    menu_url: r.url ? `${String(r.url).replace(/\/$/, '')}/menu` : '',
    website: r.website || '',
    phone: r.formatted_phone_number || '',
  });
}

// ── Yelp ─────────────────────────────────────────────────────────────────────
const YELP_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function fmtYelpTime(hhmm: string): string {
  // "1730" → "5:30 PM"
  const h = parseInt(hhmm.slice(0, 2), 10);
  const m = hhmm.slice(2);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

async function yelpDetails(id: string) {
  const apiKey = Deno.env.get('YELP_API_KEY');
  if (!apiKey) throw new Error('YELP_API_KEY not configured');

  const res = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    console.error('Yelp details error:', res.status, await res.text());
    return json(EMPTY);
  }
  const b = await res.json();

  // Build weekday_text from the regular hours block.
  let hours = null;
  const block = b.hours?.[0];
  if (block?.open) {
    const byDay: Record<number, string[]> = {};
    for (const slot of block.open) {
      const text = `${fmtYelpTime(slot.start)} – ${fmtYelpTime(slot.end)}`;
      (byDay[slot.day] ||= []).push(text);
    }
    const weekday_text = YELP_DAYS.map(
      (name, i) => `${name}: ${byDay[i]?.join(', ') || 'Closed'}`
    );
    hours = { open_now: block.is_open_now, weekday_text };
  }

  return json({
    photos: b.photos || [],
    hours,
    menu_url: b.menu_url || '',
    website: b.url || '',
    phone: b.display_phone || '',
  });
}
