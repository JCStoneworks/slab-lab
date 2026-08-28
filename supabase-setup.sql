-- Run this once in your Supabase project's SQL Editor (Dashboard > SQL Editor > New query).
-- It creates the single table the app uses to store everything: inventory, orders,
-- builders, vendors, photos, and PDF documents.

create table if not exists kv_store (
  key text not null,
  shared boolean not null default false,
  value text,
  updated_at timestamptz default now(),
  primary key (key, shared)
);

-- Row Level Security is on by default in Supabase. This policy requires a real,
-- logged-in user (via Supabase Auth) before any read or write is allowed — this
-- is what makes per-employee login screens an actual security boundary, not
-- just a UI gate: even someone with the site's public API key can't reach the
-- data without signing in first.
alter table kv_store enable row level security;

drop policy if exists "Allow all access via anon key" on kv_store;

create policy "Allow authenticated users full access"
  on kv_store
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
