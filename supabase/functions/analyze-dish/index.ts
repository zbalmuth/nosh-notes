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
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a food identification expert. Analyze the image carefully and identify ALL dishes, menu items, or food items visible. Scan the ENTIRE image from top to bottom, left to right — do not skip any section.

For each item, provide:
1. The dish name (spelled exactly as shown, or as accurately as possible)
2. The dish type (one of: appetizer, salad, soup, side, entree, drink, dessert)

Respond in JSON format only:
{"dishes": [{"name": "Dish Name", "dish_type": "entree"}]}

If it's a menu, extract EVERY item from ALL sections. If it's a receipt, extract all food items. If it's a photo of food, describe what you see. Be thorough — missing items is worse than including too many.`,
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
                text: 'What dishes or food items do you see? Respond in JSON format.',
              },
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"dishes": []}';

    // Parse JSON from the response (handle markdown code blocks)
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
