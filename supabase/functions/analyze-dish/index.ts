// Supabase Edge Function: Analyze dish photos with OpenAI Vision
// Deploy: supabase functions deploy analyze-dish
// Required secret: OPENAI_API_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function requireAuth(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', dishes: [] }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: supabaseAnonKey },
  });
  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', dishes: [] }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authErr = await requireAuth(req);
  if (authErr) return authErr;

  try {
    const { image, known } = await req.json();
    // Dishes already saved (or on the saved menu) at this restaurant. Receipts
    // abbreviate ("CHK TKA MSL"), so the model is the one that can tell a line
    // is a dish the person already has — and give its full name.
    const knownNames: string[] = Array.isArray(known)
      ? known.filter((n): n is string => typeof n === 'string' && n.length < 120).slice(0, 400)
      : [];
    // Reject oversized payloads: 10 MB of base64 ≈ 7.5 MB raw — far larger than any reasonable photo.
    if (!image || typeof image !== 'string' || image.length > 10_000_000) {
      return new Response(
        JSON.stringify({ error: 'Invalid or oversized image payload', dishes: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // gpt-4o-mini read receipts fine but skipped matches to saved dishes
        // now and then ("GRLC NAAN" left unmatched one run in two).
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a food identification expert. Identify ONLY actual food items, dishes, and beverages — nothing else. Ignore utensils, plates, napkins, furniture, people, decor, prices, taxes, service charges, and any non-food objects.

For each food/drink item, provide:
1. The item name (as shown on any menu/receipt, or a clear description)
2. The dish type (one of: appetizer, salad, soup, side, entree, drink, dessert)

If the image shows a menu or receipt, extract every food line item. If it shows actual food/dishes, describe what you see.

Respond ONLY in this exact JSON format with no other text:
{"dishes": [{"name": "Dish Name", "dish_type": "entree"}]}

If no food items are visible, respond: {"dishes": []}${knownNames.length ? `

KNOWN DISHES at this restaurant (already saved, or on its menu):
${knownNames.map((n) => `- ${n}`).join('\n')}

Receipts abbreviate and truncate names ("CHK TKA MSL", "PNR MAKHANI"). EVERY item must include a "matches" field: the exact text of the KNOWN DISHES entry it is the same dish as, copied character for character (keep its spelling and capitals even if they differ from yours), or null if none is. When there is a match, also use that same text as "name". Example: {"name": "PANEER MAKKHANI", "dish_type": "entree", "matches": "PANEER MAKKHANI"}. Only match when it is clearly the same dish — "Samosa" is not "Samosa Chaat", and "Lamb Curry" is not "Chicken Curry".` : ''}`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${image}`,
                },
              },
              {
                type: 'text',
                text: 'List all food items and dishes. JSON only.',
              },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"dishes": []}';

    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { dishes: [] };
    }

    // A matched line goes back under the known dish's own name ("CHK TKA MSL"
    // → "Chicken Tikka Masala"). The model finds the match reliably but often
    // leaves the receipt's text as the name; a match it invented is dropped.
    if (Array.isArray(parsed.dishes) && knownNames.length) {
      const byKey = new Map(knownNames.map((n) => [n.toLowerCase().trim(), n]));
      parsed.dishes = parsed.dishes.map((d: { name: string; dish_type: string; matches?: string | null }) => {
        const known = typeof d.matches === 'string' ? byKey.get(d.matches.toLowerCase().trim()) : undefined;
        const { matches: _ignored, ...rest } = d;
        return known ? { ...rest, name: known, matches: known } : rest;
      });
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: msg, dishes: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
