// Supabase Edge Function: Analyze dish photos with OpenAI Vision
// Deploy: supabase functions deploy analyze-dish
// Required secret: OPENAI_API_KEY

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
    const { image } = await req.json();
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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

If no food items are visible, respond: {"dishes": []}`,
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
        max_tokens: 600,
        temperature: 0.1,
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

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, dishes: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
