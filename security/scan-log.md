# Security Scan Log

## 2026-07-02 — Automated Weekly Scan

**Result: 3 vulnerabilities fixed.**

Scanned: `src/`, `supabase/functions/`, `supabase-schema.sql`, config files.
Threat-intel KB: empty (no entries yet in `zaks-agents/security/threat-intel.md`).

### Vulnerabilities fixed

**1. PostgREST filter injection — `src/lib/api.ts:searchDishes` (Medium)**
Previous code built `.or()` filter strings via string interpolation of raw user input.
Manual char-stripping (`/[(),"]/g`) is fragile and doesn't fully cover PostgREST's syntax.
Fixed by replacing with two separate `.ilike()` calls (typed API, no raw string building)
and merging results in JavaScript. Deduplication by `id` prevents duplicates from matched rows.

**2. Broken "Remember Me" — session persists even when user opts out (Medium)**
`AuthPage.tsx` used `window.addEventListener('beforeunload', () => supabase.auth.signOut())`.
This never worked: async Promises in `beforeunload` are not awaited, so the fetch to revoke the
server session fires-and-forgets at best, and the session data stays in localStorage indefinitely.
Fixed by:
- Adding a `hybridStorage` adapter to `supabase.ts` that prefers `sessionStorage` over
  `localStorage` whenever the key exists there (so token refresh writes to the same store).
- In `AuthPage.tsx`, after sign-in when `!rememberMe`, immediately moving the session entry
  from `localStorage` → `sessionStorage`. sessionStorage is cleared on tab close, meeting
  the user's expectation. Same-tab page refreshes still work (sessionStorage persists there).

**3. PDF files not deleted from OpenAI Files API — `supabase/functions/analyze-menu-url` (Low)**
Menus uploaded as PDFs for analysis were never deleted, accumulating indefinitely in the project's
OpenAI file storage. Fixed: after the chat completion call, the uploaded file is deleted via
`DELETE /v1/files/{id}`. Best-effort (errors swallowed) so a cleanup failure doesn't break analysis.

### Checks performed
- Unvalidated user input / injection vectors: **Fixed** (see #1 above).
- Auth/authz on API routes: **All edge functions require JWT.** RLS enforced on all tables.
- Hardcoded secrets: **None.** Environment variables used throughout; `.env` gitignored.
- XSS vectors (`dangerouslySetInnerHTML`, `eval`, `innerHTML`): **None found.**
- CSRF: **N/A.** JWT Bearer tokens in localStorage are not auto-sent cross-origin.
- SSRF: **Mitigated.** `analyze-menu-url` validates URLs against private/internal ranges, including post-redirect.
- IDOR: **Not possible.** Supabase RLS policies enforce `auth.uid() = user_id` on all tables.
- Overly permissive storage/cloud configs: **Not found in source.**
- Session management: **Fixed** (see #2 above).

### Informational (no fix required)
- `anon` role granted SELECT on all tables in schema. RLS policies return 0 rows for unauthenticated users (`auth.uid()` = NULL). No immediate data leak, but defense-in-depth would remove the grants. Requires a database migration outside this scan.
- 18 `npm audit` findings in dev/build dependencies (Vite, esbuild, Babel). Not shipped in production bundle. Blocked from auto-fix by `vite-plugin-pwa` peer dependency constraints.
- Edge function CORS is `Access-Control-Allow-Origin: *` — standard for JWT-authenticated Supabase functions serving mobile/SPA clients.

---

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
