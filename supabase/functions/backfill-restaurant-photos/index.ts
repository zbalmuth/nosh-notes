// One-off: copy every restaurant photo into Storage so it stops expiring.
// Deploy: supabase functions deploy backfill-restaurant-photos --no-verify-jwt
// Set secret BACKFILL_KEY, call with header `x-backfill-key: <BACKFILL_KEY>` and body {"dry": false};
// {"dry": true} only reports which stored links no longer load. Delete it afterwards.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const BUCKET = 'restaurant-photos';

type Grab = { status: number; type: string; bytes?: ArrayBuffer };

async function grab(url: string): Promise<Grab> {
  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) {
      await res.body?.cancel();
      return { status: res.status, type };
    }
    return { status: res.status, type, bytes: await res.arrayBuffer() };
  } catch (e) {
    return { status: 0, type: e instanceof Error ? e.message : String(e) };
  }
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
  const backfillKey = Deno.env.get('BACKFILL_KEY') ?? '';
  if (!serviceKey || !backfillKey || req.headers.get('x-backfill-key') !== backfillKey) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { dry = true } = await req.json().catch(() => ({}));
  const rest = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;

  const rows: { id: string; name: string; address: string; image_url: string }[] = await fetch(
    `${supabaseUrl}/rest/v1/restaurants?select=id,name,address,image_url&image_url=neq.`,
    { headers: rest },
  ).then((r) => r.json());
  const todo = rows.filter((r) => r.image_url && !r.image_url.startsWith(publicPrefix));

  const freshPhoto = async (name: string, address: string): Promise<Grab> => {
    const search = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${name} ${address ?? ''}`)}&key=${apiKey}`,
    ).then((r) => r.json());
    const ref = search.results?.[0]?.photos?.[0]?.photo_reference;
    if (!ref) return { status: -1, type: `no photo (${search.status})` };
    return grab(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${apiKey}`);
  };

  const report: Record<string, unknown>[] = [];
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(async (r) => {
      const old = await grab(r.image_url);
      const entry: Record<string, unknown> = { name: r.name, oldStatus: old.status };
      report.push(entry);
      if (dry) return;
      const img = old.bytes ? old : await freshPhoto(r.name, r.address);
      entry.source = old.bytes ? 'old link' : `google (${img.status})`;
      if (!img.bytes) return;
      const path = `restaurants/${r.id}.jpg`;
      const up = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...rest, 'Content-Type': img.type, 'x-upsert': 'true' },
        body: img.bytes,
      });
      if (!up.ok) { entry.error = await up.text(); return; }
      const saved = await fetch(`${supabaseUrl}/rest/v1/restaurants?id=eq.${r.id}`, {
        method: 'PATCH',
        headers: { ...rest, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: publicPrefix + path }),
      });
      entry.saved = saved.ok;
    }));
  }

  const dead = report.filter((e) => e.oldStatus !== 200).length;
  return new Response(
    JSON.stringify({ checked: todo.length, deadLinks: dead, report }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
