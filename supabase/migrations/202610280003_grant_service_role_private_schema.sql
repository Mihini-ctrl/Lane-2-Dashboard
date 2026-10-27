-- Server-side Supabase clients use the service_role database role.  The
-- private schema is intentionally hidden from browser roles, but trigger
-- functions on public tables still need to call helpers in this schema when a
-- trusted server-side import writes rows.
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;

