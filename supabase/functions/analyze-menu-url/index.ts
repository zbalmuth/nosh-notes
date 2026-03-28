// Supabase Edge Function: Analyze a menu URL and extract dishes
// Deploy: supabase functions deploy analyze-menu-url
// Required secret: OPENAI_API_KEY
// Handles: HTML pages, PDF menus, image menus, and fallback to GPT knowledge

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { encode as base64Encode } from 'https://deno.land/std@0.177.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a food menu expert. Extract ALL food and drink items from the provided menu content. For each item, provide:
1. The dish name (as it appears on the menu, or as accurately as possible)
2. The dish type (one of: appetizer, salad, soup, side, entree, drink, dessert)

Respond in JSON format only:
{"dishes": [{"name": "Dish Name", "dish_type": "entree"}], "note": ""}

The "note" field should be empty if extraction was successful, or contain a brief message if there were issues.

Extract every item you can find. Include drinks, appetizers, desserts, sides, etc. Use the exact names from the menu when available.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) throw new Error('URL is required');

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    // Fetch the URL to determine content type
    let contentType = '';
    let responseData: ArrayBuffer | null = null;
    let htmlText = '';

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml,application/pdf,image/*;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      contentType = (res.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('image/')) {
        // It's an image — read as base64
        responseData = await res.arrayBuffer();
      } else if (contentType.includes('application/pdf')) {
        // It's a PDF — read as base64
        responseData = await res.arrayBuffer();
      } else {
        // Assume HTML
        htmlText = await res.text();
      }
    } catch {
      // Fetch failed entirely
    }

    let messages: unknown[];

    if (contentType.includes('image/')) {
      // --- IMAGE MENU: Send directly to GPT-4o vision ---
      const base64 = base64Encode(new Uint8Array(responseData!));
      const mimeType = contentType.split(';')[0].trim();
      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'This is a photo/image of a restaurant menu. Extract all the dishes and drinks.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ];
    } else if (contentType.includes('application/pdf')) {
      // --- PDF MENU: Upload to OpenAI Files API, then reference in chat ---
      const base64 = base64Encode(new Uint8Array(responseData!));

      // First upload the PDF to OpenAI
      const formData = new FormData();
      const pdfBlob = new Blob([new Uint8Array(responseData!)], { type: 'application/pdf' });
      formData.append('file', pdfBlob, 'menu.pdf');
      formData.append('purpose', 'assistants');

      const uploadRes = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (uploadData.id) {
        // Use the file reference in the chat completion
        messages = [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `This is a PDF menu from ${url}. Extract ALL dishes and drinks from every section and page. Be thorough — do not skip any items.` },
              { type: 'file', file: { file_id: uploadData.id } },
            ],
          },
        ];
      } else {
        // Upload failed — fallback to asking GPT based on URL
        messages = [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `I want to know the menu items from this restaurant: ${url}\n\nThe PDF could not be processed. Based on your knowledge of this restaurant, provide the menu items you're aware of. If you don't know this restaurant, return {"dishes": [], "note": "Could not process the PDF menu. Try taking a photo instead."}`,
          },
        ];
      }
    } else if (htmlText.length > 200) {
      // --- HTML PAGE: Strip and send as text ---
      let pageText = htmlText
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&rsquo;/g, "'")
        .replace(/&lsquo;/g, "'")
        .replace(/&rdquo;/g, '"')
        .replace(/&ldquo;/g, '"')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/&#\d+;/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12000);

      // Also extract JSON-LD structured data
      const jsonLdMatches = htmlText.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
      let structuredData = '';
      if (jsonLdMatches) {
        for (const match of jsonLdMatches) {
          const json = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
          try {
            const parsed = JSON.parse(json);
            structuredData += JSON.stringify(parsed) + '\n';
          } catch {}
        }
      }

      // Check if the page might contain links to PDF/image menus
      const pdfLinks = htmlText.match(/href="([^"]*\.pdf)"/gi) || [];
      const imgMenuHint = pdfLinks.length > 0
        ? `\n\nNote: The page also contains links to PDF menus: ${pdfLinks.slice(0, 3).join(', ')}. The text below is from the HTML page itself.`
        : '';

      const content = structuredData
        ? `STRUCTURED MENU DATA:\n${structuredData}\n\nPAGE TEXT:\n${pageText}${imgMenuHint}`
        : `Menu page at ${url}:\n\n${pageText}${imgMenuHint}`;

      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ];
    } else {
      // --- FALLBACK: Rely on GPT's knowledge of the restaurant ---
      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `I want to know the menu items from this restaurant: ${url}

The page content could not be fetched. Based on your knowledge of this restaurant, provide the menu items you're aware of. If you don't know this restaurant, return {"dishes": [], "note": "Could not fetch the menu. Try taking a photo of the menu instead."}`,
        },
      ];
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 4096,
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${data.error?.message || response.statusText}`);
    }
    const content = data.choices?.[0]?.message?.content || '{"dishes": [], "note": "Failed to analyze"}';

    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { dishes: [], note: 'Failed to parse AI response' };
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: msg, dishes: [], note: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
