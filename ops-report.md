# Supabase diagnostics report — Nosh Notes

Read-only inspection. No deploys, no schema changes, no data changes were made.

- Project: **Nosh Notes** (`nosh`), ref `wzkhldndkxnkprskazie` — `ACTIVE_HEALTHY`
- Gathered: 2026-09-20 (UTC)
- Method: Supabase Management API (`api.supabase.com/v1`). The `supabase` CLI is
  not installed in this environment, so items 1, 2 and 10 were read from the
  equivalent Management API endpoints (`/functions`, `/secrets`,
  `/analytics/endpoints/logs.all`) rather than `supabase functions list` /
  `supabase secrets list`. SQL items were run read-only.

---

## 1. Edge functions

`GET /v1/projects/{ref}/functions`

| name | version | status | updated_at (UTC) | created_at (UTC) | verify_jwt |
| --- | --- | --- | --- | --- | --- |
| analyze-dish | 2 | ACTIVE | 2026-03-28T03:18:05.889Z | 2026-03-21T03:21:08.252Z | false |
| **analyze-menu-url** | **5** | **ACTIVE** | **2026-03-28T03:30:42.645Z** | 2026-03-26T02:29:20.719Z | false |
| **place-details** | **2** | **ACTIVE** | **2026-06-30T21:51:19.940Z** | 2026-06-30T21:23:17.177Z | true |
| **search-restaurants** | **10** | **ACTIVE** | **2026-04-27T20:24:30.235Z** | 2026-03-21T03:21:01.975Z | true |

Literal output:

```json
[
  {
    "name": "analyze-dish",
    "version": 2,
    "status": "ACTIVE",
    "updated_at": "2026-03-28T03:18:05.889Z",
    "created_at": "2026-03-21T03:21:08.252Z",
    "verify_jwt": false
  },
  {
    "name": "analyze-menu-url",
    "version": 5,
    "status": "ACTIVE",
    "updated_at": "2026-03-28T03:30:42.645Z",
    "created_at": "2026-03-26T02:29:20.719Z",
    "verify_jwt": false
  },
  {
    "name": "place-details",
    "version": 2,
    "status": "ACTIVE",
    "updated_at": "2026-06-30T21:51:19.940Z",
    "created_at": "2026-06-30T21:23:17.177Z",
    "verify_jwt": true
  },
  {
    "name": "search-restaurants",
    "version": 10,
    "status": "ACTIVE",
    "updated_at": "2026-04-27T20:24:30.235Z",
    "created_at": "2026-03-21T03:21:01.975Z",
    "verify_jwt": true
  }
]
```

All four functions are deployed and `ACTIVE`. The three of interest are all
present. Nothing is in a failed or removed state.

## 2. Secrets

`GET /v1/projects/{ref}/secrets` — **names only**. No secret value was read into
the report, printed, or logged; the helper script discarded the value field
before output.

**`OPENAI_API_KEY` — PRESENT.**

All secret names configured on the project:

```json
[
  "GOOGLE_PLACES_API_KEY",
  "OPENAI_API_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_DB_URL",
  "SUPABASE_JWKS",
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL"
]
```

(9 secrets. The `SUPABASE_*` entries are the platform-injected defaults;
`GOOGLE_PLACES_API_KEY` and `OPENAI_API_KEY` are project-set.)

## 3. Does `restaurant_menus` exist?

```sql
select to_regclass('public.restaurant_menus') is not null as menus_table;
```

```
{"menus_table":true}
```

**The table exists.**

## 4. RLS policies on `restaurant_menus`

```sql
select count(*) as menus_policies from pg_policies where tablename='restaurant_menus';
```

```
{"menus_policies":4}
```

## 5. Rows in `restaurant_menus`

```sql
select count(*) as menus_rows from restaurant_menus;
```

```
{"menus_rows":0}
```

**The table is empty** — created and policied, but nothing has ever been written
to it. Worth noting against item 10: there is also no edge-function traffic in
the log retention window, so nothing has been populating it recently.

## 6. Total restaurants

```sql
select count(*) as total_restaurants from restaurants;
```

```
{"total_restaurants":118}
```

## 7. Broken menu URLs

```sql
select count(*) as broken_menu_urls from restaurants
where menu_url ~ '[?&][^/]*/menu/?$';
```

```
{"broken_menu_urls":0}
```

**No rows match the broken-URL pattern.** Consistent with commit `98643a3`
("fix: repair all broken menu links in one request") already having been applied.

## 8. Restaurants with a website

```sql
select count(*) as with_website from restaurants
where website is not null and website <> '';
```

```
{"with_website":105}
```

105 of 118 (89%) have a website; 13 do not.

## 9. Restaurants matching `%moun%` / `%tunis%`

```sql
select name, menu_url, website, google_url from restaurants
where name ilike '%moun%' or name ilike '%tunis%';
```

```
{"name":"Moun Of Tunis Restaurant","menu_url":"","website":"http://www.mounoftunis.com/","google_url":"https://maps.google.com/?cid=9657603836039753019"}
```

One row. Note `menu_url` is the **empty string**, not NULL — so it is not a
"broken URL" by item 7's pattern, but it is also not a usable menu link. The
website is present (`http://www.mounoftunis.com/`, plain HTTP), so this is a
candidate for menu extraction that currently has no menu.

## 10. Recent `analyze-menu-url` errors

Queried via the Management API log explorer
(`/v1/projects/{ref}/analytics/endpoints/logs.all`), since the CLI is not
available.

| query | window | result |
| --- | --- | --- |
| `select count(*) as n from function_edge_logs` | 7 days | `{"n":0}` |
| `select count(*) as n from function_edge_logs` | 90 days | `{"n":0}` |
| `select count(*) as n from function_logs` | 90 days | `{"n":0}` |
| `edge_logs` requests with path like `%functions%` | 7 days | `[]` (no rows) |

**No errors to report — there are no edge function invocations at all in the
retention window**, so no most-frequent error message and no occurrence count
can be given.

This is not a failure of the log query itself. The same endpoint returns data
for other log sources over the same window, which confirms the pipeline works
and the function-log tables are genuinely empty:

| sanity check | window | result |
| --- | --- | --- |
| `select count(*) as n from edge_logs` | 1 day | `{"n":586}` |
| `select count(*) as n from postgres_logs` | 1 day | `{"n":22}` |

So: the API gateway and database are taking traffic; the edge functions are
deployed and ACTIVE but have not been invoked recently (within log retention).

---

## Summary

- All three functions of interest (`analyze-menu-url` v5, `place-details` v2,
  `search-restaurants` v10) are deployed and ACTIVE.
- `OPENAI_API_KEY` is present, alongside `GOOGLE_PLACES_API_KEY`.
- `restaurant_menus` exists with 4 RLS policies but **0 rows**.
- 118 restaurants, 105 with a website, **0** matching the broken-menu-url pattern.
- "Moun Of Tunis Restaurant" has an empty-string `menu_url` and a valid website.
- No edge function logs in the retention window, so no error frequencies are
  available; other log sources over the same window are non-empty, so the log
  query path itself is working.
