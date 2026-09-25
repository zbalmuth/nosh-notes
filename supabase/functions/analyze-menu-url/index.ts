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

const MAX_FETCH_BYTES = 10 * 1024 * 1024; // 10 MB cap on fetched content

// A restaurant's homepage rarely holds the menu itself — it links to it, often
// as a PDF or a /menu page. Follow at most this many of those links, best
// candidate first, before giving up.
const MAX_MENU_LINKS_FOLLOWED = 3;

// Returns true if the dotted-decimal IPv4 string falls in a private/reserved range.
function isPrivateDottedIp(ip: string): boolean {
  return (
    ip === '0.0.0.0' ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip)
  );
}

function isAllowedUrl(urlStr: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const h = parsed.hostname.toLowerCase();
  // Block loopback, private ranges, link-local (cloud metadata), and internal hostnames
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.internal') ||
    h.endsWith('.local') ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) ||
    /^169\.254\./.test(h) ||
    // Block IPv6 private/loopback ranges to prevent SSRF bypass via IPv6
    /^::ffff:/i.test(h) ||   // IPv4-mapped (e.g. ::ffff:127.0.0.1 → loopback)
    /^fc/i.test(h) ||        // unique local fc00::/7
    /^fd/i.test(h) ||        // unique local fc00::/7
    /^fe[89ab]/i.test(h)     // link-local fe80::/10
  ) return false;

  // Block alternative IPv4 representations that bypass dotted-decimal regex checks.
  // Decimal (2852039166 → 169.254.169.254), hex (0xa9fea9fe), and octal (025177524776)
  // can all resolve to private IPs on systems that support non-dotted address formats.
  if (/^\d+$/.test(h) || /^0x[\da-f]+$/i.test(h) || /^0\d+$/.test(h)) {
    let decimal: number;
    if (/^0x[\da-f]+$/i.test(h)) {
      decimal = parseInt(h, 16);
    } else if (/^0\d+$/.test(h)) {
      decimal = parseInt(h, 8);
    } else {
      decimal = parseInt(h, 10);
    }
    if (!isNaN(decimal) && decimal >= 0 && decimal <= 0xFFFFFFFF) {
      const dotted = [
        (decimal >>> 24) & 0xFF,
        (decimal >>> 16) & 0xFF,
        (decimal >>> 8) & 0xFF,
        decimal & 0xFF,
      ].join('.');
      if (isPrivateDottedIp(dotted)) return false;
    }
  }

  return true;
}

// One fetched thing the model can read: a menu image, a PDF, or an HTML page.
type Source =
  | { kind: 'image'; url: string; mime: string; bytes: ArrayBuffer }
  | { kind: 'pdf'; url: string; bytes: ArrayBuffer }
  | { kind: 'html'; url: string; html: string };

// Fetch a URL and classify it, applying the SSRF and size rules to every hop —
// followed menu links are as untrusted as the URL the user typed. Returns null
// when the URL can't be used, so the caller can move on to the next candidate.
async function loadSource(url: string): Promise<Source | null> {
  if (!isAllowedUrl(url)) return null;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/pdf,image/*;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
  } catch {
    return null;
  }
  // Validate the final URL after redirects to prevent SSRF bypass via open redirects
  if (!isAllowedUrl(res.url)) return null;
  if (!res.ok) return null;

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const contentLen = parseInt(res.headers.get('content-length') || '0', 10);
  const finalUrl = res.url || url;

  if (contentType.includes('image/') || contentType.includes('application/pdf')) {
    if (contentLen > MAX_FETCH_BYTES) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_FETCH_BYTES) return null;
    return contentType.includes('image/')
      ? { kind: 'image', url: finalUrl, mime: contentType.split(';')[0].trim(), bytes }
      : { kind: 'pdf', url: finalUrl, bytes };
  }

  // Anything else is treated as HTML. Cap it like the binary formats do — a
  // runaway page would otherwise be read into memory whole.
  if (contentLen > MAX_FETCH_BYTES) return null;
  const html = await res.text();
  if (html.length > MAX_FETCH_BYTES) return null;
  return { kind: 'html', url: finalUrl, html };
}

function stripHtml(html: string): string {
  return html
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
    .trim();
}

// How much this text reads like an actual menu rather than a landing page.
// Prices are the giveaway: a homepage talks about the restaurant, a menu lists
// things with numbers next to them.
function menuScore(text: string): number {
  const prices = (text.match(/(?:[$£€]\s?\d{1,3}(?:[.,]\d{2})?)|(?:\b\d{1,3}\.\d{2}\b)/g) || []).length;
  const sections = (text.match(/\b(appetizers?|starters?|entr[ée]es?|mains?|desserts?|salads?|soups?|sides?|beverages?|drinks?|wine list|couscous|tagines?)\b/gi) || []).length;
  return prices * 2 + sections;
}

// "Menu" is the word that actually means a menu; the rest are hints that often
// sit on a marketing page instead, so they count for less.
const STRONG_MENU_WORD = /\b(menus?|carte)\b/i;
const WEAK_MENU_WORD = /\b(food|dining|lunch|dinner|breakfast|brunch|takeout|order)\b/i;

function menuWordScore(value: string): number {
  if (STRONG_MENU_WORD.test(value)) return 3;
  if (WEAK_MENU_WORD.test(value)) return 1;
  return 0;
}

function isMenuish(value: string): boolean {
  return menuWordScore(value) > 0;
}

// Menu links on a page, best candidate first. Scores a link on where "menu"
// shows up (the href, the link text) and on the file type it points at, since
// a linked PDF is almost always the menu itself.
function findMenuLinks(html: string, baseUrl: string): string[] {
  const scored = new Map<string, number>();

  // Hand-written restaurant sites are often old HTML: unquoted href values and
  // uppercase tags are common, and a menu link missed here is the whole feature
  // failing, so accept all three quoting styles.
  const anchors = html.matchAll(
    /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a>/gi,
  );
  for (const [, dq, sq, bare, rawText] of anchors) {
    const href = (dq ?? sq ?? bare ?? '').trim();
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;

    let resolved: string;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (!isAllowedUrl(resolved)) continue;

    const text = stripHtml(rawText);
    const path = (() => { try { return new URL(resolved).pathname; } catch { return resolved; } })();
    const isPdf = /\.pdf(\?|#|$)/i.test(resolved);
    const isImage = /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(resolved);

    // A PDF or image with no menu wording anywhere is just as likely to be a
    // press photo or a wine-club flyer, so the file type alone never qualifies
    // a link — it only breaks ties between links that already mention a menu.
    const wordScore = menuWordScore(path) + menuWordScore(text);
    if (wordScore === 0) continue;
    if (resolved.split('#')[0] === baseUrl.split('#')[0]) continue;

    const score = wordScore + (isPdf ? 2 : isImage ? 1 : 0);

    const key = resolved.split('#')[0];
    scored.set(key, Math.max(scored.get(key) ?? 0, score));
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, MAX_MENU_LINKS_FOLLOWED);
}

// Given whatever the user's URL turned out to be, return the thing most worth
// showing the model. For an HTML page that isn't itself a menu, that usually
// means following one of its menu links.
async function resolveBestSource(source: Source): Promise<Source> {
  if (source.kind !== 'html') return source;

  const ownText = stripHtml(source.html);
  const ownScore = menuScore(ownText);
  // A page already sitting at /menu with prices on it needs no further hops.
  if (isMenuish(new URL(source.url).pathname) && ownScore > 0) return source;

  for (const link of findMenuLinks(source.html, source.url)) {
    const candidate = await loadSource(link);
    if (!candidate) continue;
    // A linked PDF or image menu beats any amount of homepage prose.
    if (candidate.kind !== 'html') return candidate;
    if (menuScore(stripHtml(candidate.html)) > ownScore) return candidate;
  }

  return source;
}

async function requireAuth(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', dishes: [], note: 'Authentication required.' }),
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
      JSON.stringify({ error: 'Unauthorized', dishes: [], note: 'Authentication required.' }),
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
    const { url } = await req.json();
    if (!url) throw new Error('URL is required');

    if (!isAllowedUrl(url)) {
      return new Response(
        JSON.stringify({ error: 'URL not allowed', dishes: [], note: 'The provided URL is not allowed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    // Fetch the URL, then follow it to the real menu when it turns out to be a
    // homepage that merely links to one.
    const fetched = await loadSource(url);
    const source = fetched ? await resolveBestSource(fetched) : null;
    const pageText = source?.kind === 'html' ? stripHtml(source.html) : '';

    let messages: unknown[];
    let openaiFileId: string | null = null;

    if (source?.kind === 'image') {
      // --- IMAGE MENU: Send directly to GPT-4o vision ---
      const base64 = base64Encode(new Uint8Array(source.bytes));
      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'This is a photo/image of a restaurant menu. Extract all the dishes and drinks.' },
            { type: 'image_url', image_url: { url: `data:${source.mime};base64,${base64}` } },
          ],
        },
      ];
    } else if (source?.kind === 'pdf') {
      // --- PDF MENU: Upload to OpenAI Files API, then reference in chat ---
      // First upload the PDF to OpenAI
      const formData = new FormData();
      const pdfBlob = new Blob([new Uint8Array(source.bytes)], { type: 'application/pdf' });
      formData.append('file', pdfBlob, 'menu.pdf');
      formData.append('purpose', 'assistants');

      const uploadRes = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (uploadData.id) {
        openaiFileId = uploadData.id;
        // Use the file reference in the chat completion
        messages = [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `This is a PDF menu from ${source.url}. Extract ALL dishes and drinks from every section and page. Be thorough — do not skip any items.` },
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
    } else if (source?.kind === 'html' && pageText.length > 200) {
      // --- HTML PAGE: Strip and send as text ---
      // Also extract JSON-LD structured data
      const jsonLdMatches = source.html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
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

      const body = pageText.slice(0, 12000);
      const content = structuredData
        ? `STRUCTURED MENU DATA:\n${structuredData}\n\nPAGE TEXT:\n${body}`
        : `Menu page at ${source.url}:\n\n${body}`;

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

    // Delete the uploaded PDF from OpenAI's file storage — best-effort, don't fail on cleanup errors.
    if (openaiFileId) {
      fetch(`https://api.openai.com/v1/files/${openaiFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      }).catch(() => {});
    }

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

    // The model's own wording for an empty result ("No specific menu items were
    // listed in the provided content") tells the person nothing they can act
    // on, so say what to try instead.
    if (!parsed.dishes?.length) {
      // A page that ships a lot of markup and almost no text builds its
      // content in the browser — Squarespace code blocks, DoorDash
      // storefronts. There is no menu in the response to find, so saying
      // "try a link straight to the menu" just sends people round again.
      // Measured against this user's own restaurants: pages that render their
      // menu client-side strip down to ~700 characters of navigation from
      // 30-350 KB of markup, while pages we can actually read start around
      // 1,000. It only picks the wording of a failure, so the margin is cheap.
      const clientRendered = source?.kind === 'html' && source.html.length > 20000 && pageText.length < 900;
      if (!source) {
        parsed.note = "We couldn't open that page. Try another link, or use Scan to photograph the menu.";
      } else if (clientRendered) {
        parsed.note = 'This site builds its menu in the browser, so there is nothing for us to read. Scan works best here.';
      } else {
        parsed.note = "We couldn't find a menu on that page. Try pasting a link straight to the menu, or use Scan to photograph it.";
      }
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
