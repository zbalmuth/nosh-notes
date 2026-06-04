// Refresh image_url for restaurants with expired Google photo URLs
// Run: npx tsx scripts/refresh-images.ts <email> <password>

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars. Copy .env.example to .env.local and fill in values.');
  process.exit(1);
}

const EDGE_URL = `${SUPABASE_URL}/functions/v1/search-restaurants`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: npx tsx scripts/refresh-images.ts <email> <password>');
  process.exit(1);
}

async function main() {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) { console.error('Sign in failed:', signInError.message); process.exit(1); }

  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('id, name, city, state, image_url')
    .like('image_url', 'https://maps.googleapis.com/maps/api/place/photo%');

  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }
  console.log(`Refreshing images for ${restaurants?.length ?? 0} restaurants...\n`);

  let fixed = 0, failed = 0;

  for (const r of restaurants ?? []) {
    process.stdout.write(`  ${r.name}... `);
    try {
      const location = r.city ? `${r.city}${r.state ? `, ${r.state}` : ''}` : '';
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ query: r.name, provider: 'google', location }),
      });

      const data = await res.json();
      const imageUrl = data?.results?.[0]?.image_url;

      if (imageUrl && imageUrl.startsWith('https://lh3.google')) {
        await supabase.from('restaurants').update({ image_url: imageUrl }).eq('id', r.id);
        console.log('✓');
        fixed++;
      } else {
        console.log('✗ (no CDN url in results)');
        failed++;
      }
    } catch (e: any) {
      console.log(`✗ (${e.message})`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone: ${fixed} fixed, ${failed} failed`);
}

main();
