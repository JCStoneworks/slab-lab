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

-- Row Level Security is on by default in Supabase. This policy allows the app's
-- public "anon" key to read and write freely, since access control for this app
-- is handled at the hosting level (password-protecting the site itself) rather
-- than per-user logins. If you later want per-user accounts inside the app
-- itself, this policy is the first thing you'd tighten.
alter table kv_store enable row level security;

create policy "Allow all access via anon key"
  on kv_store
  for all
  using (true)
  with check (true);
