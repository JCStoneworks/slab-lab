// Recreates the window.storage API the app already uses (get/set/delete/list),
// backed by a Supabase table instead of Claude's built-in artifact storage.
// The app's code (App.jsx) is completely unchanged — it just calls window.storage
// the same way it always did.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to a .env file (see .env.example) or your host's environment variables."
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function get(key, shared = false) {
  const { data, error } = await supabase
    .from("kv_store")
    .select("value")
    .eq("key", key)
    .eq("shared", shared)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("not found");
  return { key, value: data.value, shared };
}

async function set(key, value, shared = false) {
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, shared, updated_at: new Date().toISOString() }, { onConflict: "key,shared" });
  if (error) {
    console.error("storage.set failed:", error.message);
    return null;
  }
  return { key, value, shared };
}

async function del(key, shared = false) {
  const { error } = await supabase.from("kv_store").delete().eq("key", key).eq("shared", shared);
  if (error) {
    console.error("storage.delete failed:", error.message);
    return null;
  }
  return { key, deleted: true, shared };
}

async function list(prefix = "", shared = false) {
  let query = supabase.from("kv_store").select("key").eq("shared", shared);
  if (prefix) query = query.like("key", `${prefix}%`);
  const { data, error } = await query;
  if (error) {
    console.error("storage.list failed:", error.message);
    return null;
  }
  return { keys: (data || []).map((row) => row.key), prefix, shared };
}

window.storage = { get, set, delete: del, list };
