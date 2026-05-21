// Fix existing restaurant image URLs by resolving Google photo redirects server-side
// Run: npx tsx scripts/fix-image-urls.ts <email> <password>

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wzkhldndkxnkprskazie.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2hsZG5ka3hua3Byc2themllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjIzMzksImV4cCI6MjA4OTYzODMzOX0.I8vwoYCQ6z7AKvW3eGPOi5ByGFecPchZVwVw2rgwQuw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: npx tsx scripts/fix-image-urls.ts <email> <password>');
  process.exit(1);
}

async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return res.url !== url ? res.url : '';
  } catch {
    return '';
  }
}

async function main() {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) { console.error('Sign in failed:', signInError.message); process.exit(1); }

  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('id, name, image_url')
    .like('image_url', 'https://maps.googleapis.com/maps/api/place/photo%');

  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }
  console.log(`Found ${restaurants?.length ?? 0} restaurants with Google photo URLs`);

  let fixed = 0, failed = 0;
  for (const r of restaurants ?? []) {
    process.stdout.write(`  ${r.name}... `);
    const cdnUrl = await resolveRedirect(r.image_url);
    if (cdnUrl) {
      await supabase.from('restaurants').update({ image_url: cdnUrl }).eq('id', r.id);
      console.log('✓');
      fixed++;
    } else {
      console.log('✗ (no redirect)');
      failed++;
    }
    // Small delay to avoid hammering Google
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone: ${fixed} fixed, ${failed} failed`);
}

main();
