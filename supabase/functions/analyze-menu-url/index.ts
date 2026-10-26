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

Extract every item you can find. Include drinks, appetizers, desserts, sides, etc. Use the exact names from the menu when available.

Only list specific items someone could actually order. A restaurant's homepage often describes its food in general terms ("Rich curries", "Authentic Punjabi dishes", "Flavorful basmati rice") — those are marketing copy, not menu items: leave them out. If the content has no real menu items, return an empty "dishes" list rather than guessing.`;

const MAX_FETCH_BYTES = 10 * 1024 * 1024; // 10 MB cap on fetched content

// A restaurant's homepage rarely holds the menu itself — it links to it, often
// as a PDF or a /menu page, and the menu is often split across several of them
// (lunch, dinner, drinks). Follow this many, best candidate first, all at once.
const MAX_MENU_LINKS_FOLLOWED = 5;

// A menu split across several embedded files (dinner, wine, dessert) is normal.
// Read a few and let the model see them together.
const MAX_EMBEDDED_MENUS = 3;

// Everything read off one restaurant goes to the model together, up to these.
const MAX_SOURCES = 6;
// Page text the model sees, across all pages. This was 12,000 characters for
// one page, which cut a long menu with descriptions off partway through — the
// "it found 14 dishes" failure. A full menu fits easily in this.
const MAX_PAGE_TEXT = 80000;

// A restaurant site that never finishes responding would otherwise hold the
// whole request open — one took 136 s in a sweep of this user's list. Every
// hop gets its own budget; a slow page is simply not worth waiting for.
const FETCH_TIMEOUT_MS = 12000;

// Drive renders a page image for any file it will show in a viewer, including
// ones whose owner has turned downloading off — which is most restaurant menus
// shared this way. `uc?export=download` answers "Can't download file" for those;
// this answers with a PNG that vision can read.
function driveThumbnailUrl(url: string): string | null {
  const id = url.match(
    /(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([A-Za-z0-9_-]{16,})/,
  )?.[1];
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : null;
}

// Menus that a page embeds rather than writes into itself: a Drive PDF in an
// iframe, a linked PDF, a photographed menu. This is how a site can look empty
// to a fetcher and perfectly normal in a browser.
function findEmbeddedMenuUrls(html: string, baseUrl: string): string[] {
  const found: string[] = [];
  for (const [, rawSrc] of html.matchAll(/<iframe\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi)) {
    let resolved: string;
    try {
      resolved = new URL(rawSrc, baseUrl).toString();
    } catch {
      continue;
    }
    if (!isAllowedUrl(resolved)) continue;
    // Reservations, video and maps are iframed just as often as menus are.
    if (/youtube|youtu\.be|vimeo|\/maps|instagram|facebook|opentable|resy\.com|exploretock|yelp/i.test(resolved)) continue;

    const drive = driveThumbnailUrl(resolved);
    if (drive) { found.push(drive); continue; }
    if (/\.(pdf|png|jpe?g|webp)(\?|#|$)/i.test(resolved)) found.push(resolved);
  }
  return [...new Set(found)].slice(0, MAX_EMBEDDED_MENUS);
}

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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

  // Site builders (Wix, Squarespace, GoDaddy) often draw the nav in script,
  // so the menu link never appears as an <a> — but its URL still sits in the
  // page's code. Pick up same-site URLs with "menu" in the path from anywhere.
  let host = '';
  try { host = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { /* keep '' */ }
  for (const [, raw] of html.matchAll(/["'(](https?:\\?\/\\?\/[^"'()\s<>]+|\/[A-Za-z0-9][^"'()\s<>]*)["')]/g)) {
    const candidate = raw.replace(/\\\//g, '/');
    let resolved: URL;
    try { resolved = new URL(candidate, baseUrl); } catch { continue; }
    if (resolved.hostname.replace(/^www\./, '') !== host) continue;
    if (!STRONG_MENU_WORD.test(resolved.pathname.replace(/[-_/.]/g, ' '))) continue;
    if (/\.(css|js|json|svg|woff2?|ico)(\?|$)/i.test(resolved.pathname)) continue;
    const key = resolved.toString().split('#')[0];
    if (key === baseUrl.split('#')[0] || !isAllowedUrl(key)) continue;
    const isPdf = /\.pdf(\?|#|$)/i.test(key);
    scored.set(key, Math.max(scored.get(key) ?? 0, 3 + (isPdf ? 2 : 0)));
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, MAX_MENU_LINKS_FOLLOWED);
}

// Where a menu usually lives when the homepage gives no sign of it.
const COMMON_MENU_PATHS = ['/menu', '/menus', '/our-menu', '/food-menu', '/menu.html', '/menu.pdf'];

// Given whatever the user's URL turned out to be, return everything worth
// showing the model: the page itself if it's a menu, any menu files it embeds,
// and every menu page or file it links to that actually reads like a menu.
// Falls back to the page itself when none of that turns anything up.
async function resolveBestSources(source: Source): Promise<Source[]> {
  if (source.kind !== 'html') return [source];

  const found: Source[] = [];
  const ownText = stripHtml(source.html);
  const ownScore = menuScore(ownText);
  // A page at /menu with any menu text, or any page with real prices on it.
  const ownIsMenu = ownText.length >= 900 &&
    ((isMenuish(new URL(source.url).pathname) && ownScore > 0) || ownScore >= 6);
  if (ownIsMenu) found.push(source);

  // Embedded files: a page that embeds its menu usually has nothing in its
  // own markup.
  found.push(...await loadEmbeddedMenus(source.html, source.url));

  // Linked menus, fetched in parallel — one at a time, a few slow pages added
  // up to most of the wait.
  let links = findMenuLinks(source.html, source.url);
  // Nothing on the page points at a menu: try the usual addresses (a miss is
  // just a quick 404).
  if (links.length === 0 && !ownIsMenu) {
    links = COMMON_MENU_PATHS.map((path) => new URL(path, source.url).toString());
  }
  const candidates = await Promise.all(links.map((link) => loadSource(link)));
  for (const candidate of candidates) {
    if (!candidate) continue;
    // A linked PDF or image menu is the menu.
    if (candidate.kind !== 'html') { found.push(candidate); continue; }
    // The menu page reached from a homepage is frequently itself just a shell
    // around embedded files, so it has to be opened the same way.
    const nested = await loadEmbeddedMenus(candidate.html, candidate.url);
    if (nested.length) { found.push(...nested); continue; }
    // It was linked as a menu; a few prices or section headings confirm it.
    // (Some menus print no prices at all.)
    if (menuScore(stripHtml(candidate.html)) >= 3) found.push(candidate);
  }

  // The same file is often linked from more than one place.
  const unique = [...new Map(found.map((s) => [s.url.split('#')[0], s])).values()];
  return unique.length ? unique.slice(0, MAX_SOURCES) : [source];
}

async function loadEmbeddedMenus(html: string, baseUrl: string): Promise<Source[]> {
  const loaded: Source[] = [];
  for (const embedUrl of findEmbeddedMenuUrls(html, baseUrl)) {
    const source = await loadSource(embedUrl);
    if (source && source.kind !== 'html') loaded.push(source);
  }
  return loaded;
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

// Fewer dishes than this from the site itself and we also look the menu up on
// the web. Restaurant sites that keep their menu out of reach (ordering
// widgets, script-built pages, photos) are common; menu listings on Yelp,
// DoorDash and the like usually have it in full.
const WEB_SEARCH_BELOW = 15;

// Which of the caller's restaurants this link belongs to. Runs as the caller,
// so row-level security limits it to their own restaurants.
async function findRestaurant(authHeader: string, url: string): Promise<{ name: string; city: string; state: string; address: string } | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const headers = { Authorization: authHeader, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' };
  for (const column of ['website', 'menu_url']) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/restaurants?select=name,city,state,address&${column}=eq.${encodeURIComponent(url)}&limit=1`,
        { headers },
      );
      const rows = res.ok ? await res.json() : [];
      if (rows[0]?.name) return rows[0];
    } catch {
      // the lookup only enables the web search; carry on without it
    }
  }
  return null;
}

// Ask a search-enabled model for the restaurant's menu as it's listed around
// the web. Returns [] on any failure — it only ever adds to what the site gave.
async function searchMenuOnWeb(
  apiKey: string,
  restaurant: { name: string; city: string; state: string; address: string },
  url: string,
): Promise<{ name: string; dish_type: string }[]> {
  const where = [restaurant.address, restaurant.city, restaurant.state].filter(Boolean).join(', ');
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview',
        web_search_options: {},
        max_tokens: 16000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Find the full current menu of the restaurant "${restaurant.name}"${where ? ` at ${where}` : ''} (website: ${url}). Search its own site and menu listings such as Yelp, DoorDash, Uber Eats, Grubhub, Allmenus and MenuPages. Make sure it is this exact location, not another restaurant with a similar name. List every dish and drink on the menu. Respond with the JSON object only.`,
          },
        ],
      }),
      // Leaves the whole request well inside the function's time limit.
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.log(JSON.stringify({ web_search_error: res.status, body: (await res.text()).slice(0, 300) }));
      return [];
    }
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    // No JSON mode on search models: take the outermost object in the reply.
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
    const dishes = JSON.parse(json).dishes;
    return Array.isArray(dishes) ? dishes.filter((d) => typeof d?.name === 'string') : [];
  } catch (err) {
    console.log(JSON.stringify({ web_search_error: String(err) }));
    return [];
  }
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

    // The web lookup runs alongside reading the site rather than after it: one
    // after the other could outlast the function's time limit, which reached
    // the app as an error and saved nothing. Its answer is only used if the
    // site comes back short.
    const webLookup = findRestaurant(req.headers.get('Authorization') ?? '', url)
      .then((restaurant) => (restaurant ? searchMenuOnWeb(apiKey, restaurant, url).then((dishes) => ({ restaurant, dishes })) : null));

    // Fetch the URL, then follow it to the real menu when it turns out to be a
    // homepage that merely links to one.
    const fetched = await loadSource(url);
    const sources = fetched ? await resolveBestSources(fetched) : [];
    // What was actually read, for working out why a menu came back short.
    console.log(JSON.stringify({
      menu_url: url,
      fetched: fetched ? { kind: fetched.kind, url: fetched.url, bytes: fetched.kind === 'html' ? fetched.html.length : fetched.bytes.byteLength } : null,
      sources: sources.map((s) => ({ kind: s.kind, url: s.url, text: s.kind === 'html' ? stripHtml(s.html).length : undefined })),
    }));
    const source = sources[0] ?? null;
    const imageSources = sources.filter((s): s is Extract<Source, { kind: 'image' }> => s.kind === 'image');
    const pdfSources = sources.filter((s): s is Extract<Source, { kind: 'pdf' }> => s.kind === 'pdf');
    const htmlSources = sources.filter((s): s is Extract<Source, { kind: 'html' }> => s.kind === 'html');
    const pageText = source?.kind === 'html' ? stripHtml(source.html) : '';

    // PDFs go up to OpenAI's file store and are referenced from the message.
    const openaiFileIds: string[] = [];
    for (const pdf of pdfSources) {
      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(pdf.bytes)], { type: 'application/pdf' }), 'menu.pdf');
      formData.append('purpose', 'assistants');
      try {
        const uploadRes = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.id) openaiFileIds.push(uploadData.id);
      } catch {
        // One unreadable PDF shouldn't sink the pages that did load.
      }
    }

    // Every readable page, each with its own share of the text budget, plus
    // any JSON-LD menu data it carries.
    const pageBlocks = htmlSources
      .map((page) => {
        let structured = '';
        for (const match of page.html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? []) {
          try {
            structured += JSON.stringify(JSON.parse(match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim())) + '\n';
          } catch {
            // malformed JSON-LD is common; the page text still has the menu
          }
        }
        const text = stripHtml(page.html).slice(0, Math.floor(MAX_PAGE_TEXT / htmlSources.length));
        return { url: page.url, text, structured };
      })
      .filter((page) => page.text.length > 200 || page.structured);

    const parts: unknown[] = [];
    if (pageBlocks.length || imageSources.length || openaiFileIds.length) {
      const pieces = pageBlocks.length + imageSources.length + openaiFileIds.length;
      parts.push({
        type: 'text',
        text: pieces > 1
          ? `The following ${pieces} pages, files and images are all from one restaurant's menu (lunch, dinner, drinks and so on may be split across them). Extract ALL dishes and drinks from every one of them. Be thorough — do not skip any items or sections.`
          : 'This is a restaurant menu. Extract ALL dishes and drinks from every section. Be thorough — do not skip any items.',
      });
      for (const page of pageBlocks) {
        parts.push({
          type: 'text',
          text: `${page.structured ? `STRUCTURED MENU DATA:\n${page.structured}\n` : ''}MENU PAGE at ${page.url}:\n\n${page.text}`,
        });
      }
      for (const img of imageSources) {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${img.mime};base64,${base64Encode(new Uint8Array(img.bytes))}` },
        });
      }
      for (const fileId of openaiFileIds) {
        parts.push({ type: 'file', file: { file_id: fileId } });
      }
    }

    let messages: unknown[];
    if (parts.length) {
      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: parts },
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
        // A big menu is a long answer. At 4,096 it could be cut off mid-JSON,
        // which then failed to parse and came back as no dishes at all.
        max_tokens: 16000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();

    // Delete the uploaded PDF from OpenAI's file storage — best-effort, don't fail on cleanup errors.
    for (const fileId of openaiFileIds) {
      fetch(`https://api.openai.com/v1/files/${fileId}`, {
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
    if (!Array.isArray(parsed.dishes)) parsed.dishes = [];

    // The site gave little or nothing: look the menu up on the web as well.
    if (parsed.dishes.length < WEB_SEARCH_BELOW) {
      const web = await webLookup;
      if (web) {
        console.log(JSON.stringify({ web_search: web.restaurant.name, site_dishes: parsed.dishes.length, web_dishes: web.dishes.length }));
        if (web.dishes.length > 0) {
          parsed.dishes = [...parsed.dishes, ...web.dishes];
          parsed.note = '';
        }
      }
    }

    // The same dish listed on the lunch and the dinner page is one dish.
    if (Array.isArray(parsed.dishes)) {
      const seen = new Set<string>();
      parsed.dishes = parsed.dishes.filter((d: { name?: string }) => {
        const key = (d.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
