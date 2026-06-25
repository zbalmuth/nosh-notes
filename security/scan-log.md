# Security Scan Log

## 2025-06-25 — Automated Weekly Scan

**Result: PASS — No actionable vulnerabilities found.**

Scanned: `src/`, `supabase/functions/`, `supabase-schema.sql`, config files.

### Checks performed
- Unvalidated user input / injection vectors: **None found.** `searchDishes` sanitizes PostgREST filter chars.
- Auth/authz on API routes: **All edge functions require JWT.** RLS enforced on all tables.
- Hardcoded secrets: **None.** Environment variables used throughout; `.env` gitignored.
- XSS vectors (`dangerouslySetInnerHTML`, `eval`, `innerHTML`): **None found.**
- CSRF: **N/A.** JWT Bearer tokens in localStorage are not auto-sent cross-origin.
- SSRF: **Mitigated.** `analyze-menu-url` validates URLs against private/internal ranges, including post-redirect.
- IDOR: **Not possible.** Supabase RLS policies enforce `auth.uid() = user_id` on all tables.
- Overly permissive storage/cloud configs: **Not found in source.**

### Informational (no fix required)
- 18 `npm audit` findings in dev/build dependencies (Vite, esbuild, Babel). Not shipped in production bundle. Blocked from auto-fix by `vite-plugin-pwa` peer dependency constraints.
- Edge function CORS is `Access-Control-Allow-Origin: *` — standard for JWT-authenticated Supabase functions serving mobile/SPA clients.
