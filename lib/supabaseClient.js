import { createClient } from '@supabase/supabase-js'

// This is the only place a Supabase key ever reaches the browser. It's the anon key,
// safe to inline into the client bundle only because migrations/020_rls_lockdown.sql
// and 021_other_brains.sql lock every table down to deny-all except explicit
// public-read policies on other_brains_messages/suggestions/books — the sole reason
// this client exists is to subscribe to Realtime changes on those three tables. All
// writes still go through pages/api/other-brains/*.js using lib/db.js's server pool.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let client = null

export function getSupabaseClient() {
  if (!url || !anonKey) return null
  if (!globalThis.__supabaseClient) {
    globalThis.__supabaseClient = createClient(url, anonKey)
  }
  client = globalThis.__supabaseClient
  return client
}
