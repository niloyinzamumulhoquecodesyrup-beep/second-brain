-- Security remediation: every table below was created with Row Level Security off,
-- which means the Supabase anon/authenticated keys (the credentials any browser-side
-- Supabase client library uses) had full read/write access to all of them, including
-- users.password_hash. Nothing in this app has ever shipped a Supabase key to the
-- browser, so this was latent rather than exploited -- but the "Other Brains" feature
-- (see 021_other_brains.sql) is about to be the first thing that does, for its
-- Realtime chat/suggestions/books. Before that key exists client-side, every
-- unrelated table needs to stop trusting it.
--
-- This migration enables RLS with NO policies on all of them, which is a pure
-- deny-all for the anon/authenticated roles. It has zero effect on this app: every
-- server-side query goes through lib/db.js's pool, authenticated as the Postgres
-- table-owner role, and Postgres never applies RLS to a table's owner unless FORCE
-- ROW LEVEL SECURITY is set (it isn't, here). 021_other_brains.sql is the only place
-- that grants the anon role any access at all, and only to the three tables that
-- actually need to be readable for Realtime to work.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.para_fun_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_cycle_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_knowledge_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_prompts ENABLE ROW LEVEL SECURITY;
