# Mind Model Brief — context & instructions for Claude Code

This file is the full context and build brief for turning this app into a "Mind Model": a system that
observes the single user's behavior over time, learns their interests/gaps/attention patterns, and acts as
an external logical/organizing layer so they can spend their own attention on creative work instead of
tracking and remembering things. Read this whole file before making changes. If anything below is
ambiguous or conflicts with the existing codebase, stop and ask rather than guessing.

## 0. What this app already is

Next.js (pages router) + Postgres (Supabase). Single account, password-protected (bcrypt + signed JWT in an
httpOnly cookie), every page/route gated server-side via `getServerSideProps` / `withAuth`.

Existing schema (see `migrations/001_init.sql`, `002_tasks.sql`, `003_inbox.sql`):
- `users` — single account (multi-user register route exists but this is used as single-tenant)
- `notes` — title, content, `para` bucket (`inbox|project|area|resource|archive`), tags[], source_url,
  executive_summary, `distilled` bool, pinned, status
- `note_links` — `[[Title]]` references parsed into backlinks
- `packets` — reusable content fragments tied to a note
- `tasks` — checkable next actions, `done`, `due_date`, `completed_at`

Existing pages: `capture`, `organize`, `distill`, `express`, `focus` (a focus-timer page with an end chime),
`index` (dashboard), `login`/`register`.

## 1. Hard constraints — already decided, do not relitigate these

- **No local storage anywhere.** Not a local file, not a local SQLite DB, nothing gitignored-but-on-disk.
  Everything — raw activity events, processed insights, goal inferences — lives in the same Postgres DB the
  app already uses, scoped to the single `user_id`. This was a deliberate choice for durability and having
  one system to reason about, made with the tradeoff explicitly acknowledged (raw browsing history in a
  hosted DB is more exposed than local-only storage would have been — the user accepted this tradeoff given
  the app is already auth-gated).
- **Single account only.** Don't build multi-tenant complexity beyond the `user_id` scoping that already
  exists. Everything here is "for my account" — no other user should ever see this data or these features.
- **No MCP server, no standing daemon the user has to remember to start.** Data capture happens via a
  browser extension posting to the app's own API. Processing happens via a daily scheduled job (see §6),
  not something requiring the user to manually run a connector every day.
- **Browser-only activity capture for now.** Not full OS-level tracking (no native app/window watcher, no
  screen recording, no keylogging). Just browser tab/URL/title/duration via an extension. Revisit later if
  the user wants non-browser coverage.
- **Design principle: mirror, not oracle.** Every insight the system surfaces must be traceable back to the
  specific notes/activity that produced it, and phrased as an observation, not a directive. Write "12 notes
  captured on X, 0 distilled" — never "you should focus on X." This applies to interest clusters, gap
  detection, and especially the inferred life goals below. The reasoning: research on belief-offloading in
  human-AI interaction shows systems that shape conclusions (not just surface facts) create unhealthy
  reliance. Do not soften this into "helpful suggestions" during implementation — keep it factual and
  sourced.
- **ADHD-accommodating by default**, since attention/learning-gap detection is a stated goal:
  - Never render a big undifferentiated list. Any "what should I do" surface defaults to one next action,
    with everything else collapsed/hidden behind a click.
  - Track and show *actual* logged durations, not estimates — time blindness is a real design target here.
  - Auto-suggest breaking a stalled project (no activity in N days) into one small next packet/task, to
    lower the activation energy of restarting.
  - Surface start-without-finish patterns descriptively, never with shame framing.

## 2. New data model

Add via a new migration (`migrations/004_mind_model.sql` or similar):

- **`device_activity`** — raw browser activity from the extension: `user_id`, `url`, `domain`, `title`,
  `started_at`, `ended_at`, `duration_seconds`. One row per continuous focused-tab session.
- **`activity_log`** — in-app behavioral events (separate from `device_activity`): `user_id`, `event_type`
  (e.g. `note_created`, `note_edited`, `para_moved`, `task_completed`, `packet_created`, `focus_session`),
  `entity_id` (note/task/packet id if applicable), `metadata` (jsonb — e.g. from/to para, duration), 
  `created_at`. Hook this into the existing API routes (`pages/api/notes/*`, `pages/api/tasks/*`,
  `pages/api/packets*`, and the focus page) so it's populated as a side effect of normal use, not a
  separate manual step.
- **`mind_insights`** — output of the synthesis job: `user_id`, `kind` (`interest_cluster` | `open_loop` |
  `attention_pattern` | `dormant_revival` | `inferred_goal`), `summary` (plain-language text), `source_refs`
  (jsonb array of note/activity ids this was derived from — required, not optional), `created_at`,
  `superseded_by` (nullable, points to a newer insight of the same kind so history isn't just overwritten).
- **`push_subscriptions`** — `user_id`, subscription object (endpoint + keys) from the Push API, `created_at`.
  Needed for §5.

## 3. Browser extension (activity capture)

Manifest V3 Chrome extension. Tracks the active tab's URL, domain, page title, and focused duration —
pause the timer on tab blur or when the OS reports idle. Batches events locally in extension memory/
`chrome.storage.local` only as a send buffer (not permanent local storage — flush and clear on successful
POST), and posts to a new authenticated endpoint on this app, e.g. `POST /api/activity/ingest`, which
writes into `device_activity`. Auth: reuse the existing session cookie/JWT scheme if the extension can hold
a long-lived personal token issued by the app (add a simple token-issuing route gated behind the existing
login), rather than inventing a second auth system.

## 4. Synthesis job — "Mind Model v1"

A job (script or route, triggered by §6's daily loop) that reads `device_activity` + `activity_log` +
`notes` for the account and computes, writing results into `mind_insights`:

- **Interest clusters** — group notes/activity by topic (start with tags + domain/title keyword overlap;
  embeddings/pgvector can come later) and track whether a cluster is growing or fading.
- **Open loops** — notes captured but never distilled or expressed into a task/packet. This is the
  system's actual definition of a "gap," not a vibe.
- **Attention patterns** — derived directly from logged data: median time-to-abandon on a note/task, ratio
  of captures to completions, capture time-of-day vs. focus-session time-of-day, PARA-bucket
  context-switch frequency per session.
- **Dormant revival** — things the user was once actively engaged with (a note, tag cluster, or project)
  that have had no activity for a long stretch (weeks+) after a period of real activity. Surface these as
  "you were doing/exploring this a while back — want to pick it back up?" This is distinct from "open
  loops": open loops are unfinished-recent, dormant revival is finished-or-paused-long-ago. Both should
  exist as separate `mind_insights` kinds.
- **Inferred goals** — attempt to infer likely life/study goals from patterns across Projects/Areas notes
  (recurring themes, stated intentions in note content, project titles). Must always be written with
  `source_refs` pointing at the specific notes that led to the inference, and displayed as "it looks like
  you're working toward X, based on these notes" — never as settled fact. The user should be able to see
  and correct it, not just receive it.

## 5. Push notifications

Real Web Push (service worker + VAPID keys + `push_subscriptions` table from §2) so notifications reach the
user even with the tab/browser closed — this was an explicit requirement, not an in-page-only notification.

- Start at a fixed ~hourly cadence: a lightweight "what are you doing right now?" prompt (tap to
  quick-tag or type a one-liner), which itself becomes another source of ground truth alongside
  `device_activity`.
- Evolve toward adaptive timing once `attention_pattern` insights exist: suppress prompts during detected
  focus/flow (e.g. mid-focus-session, or a domain/app with long continuous duration), prompt more when the
  data shows rapid context-switching or idle drift.
- Also used to deliver: dormant-revival nudges (§4) and goal-alignment nudges (§7). Don't build a second
  notification pipe for those — same subscription/delivery mechanism, different message source.

## 6. Daily loop (orchestration)

This is the operational loop the user specified — implement it literally:

1. The app continuously accumulates data into `device_activity` and `activity_log` as the user uses the
   browser and the app (no manual step).
2. Once a day (scheduled — this can be a Cowork scheduled task hitting an authenticated endpoint, or a
   cron-triggered API route; either is fine), the app assembles/exposes the relevant window of new data
   (a "dump" — e.g. a `GET /api/mind/dump?since=...` endpoint returning the raw rows).
3. The synthesis step (§4) consumes that dump, computes updated insights, and writes them to
   `mind_insights` (this is "you check it and update what the app should do" — the synthesis step is what
   decides what the mind_insights state should now say).
4. The app reads current `mind_insights` state and acts on it: updates the dashboard (§8), decides what
   the next push notification should say and when (§5), decides whether to surface a dormant-revival or
   goal-alignment nudge.
5. This repeats automatically every day. The user should also be able to trigger it manually on demand
   (e.g. a "check now" action), but the daily automatic run is the primary loop — the user should not have
   to remember to ask for it.

## 7. Goal-alignment reminders

Periodic (not necessarily daily — avoid nagging) comparison of current activity against the `inferred_goal`
insights from §4, delivered via §5's push mechanism. Always paired with the source notes the goal was
inferred from, so it reads as "this looks related/unrelated to what you said you're working toward in
[note]," not an unexplained judgment call.

## 8. Mind Model dashboard page

New page (e.g. `/mind`) showing current `mind_insights`, grouped by kind, each with its source references
visible/expandable. This is the human-readable surface of everything above — keep it a mirror (§1), not a
scorecard or a to-do list dressed up as insight.

## 8b. Prerequisite: Supabase MCP for Claude Code

Before starting the build, connect Claude Code to this project's Supabase instance via Supabase's own MCP
server, so migrations/queries can be run and verified directly against real data instead of via raw
`DATABASE_URL` scripts from an unprivileged sandbox:

```
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=uzscrxlcrxchyckumwls"
claude          # then run /mcp, select supabase, authenticate (opens a browser login)
npx skills add supabase/agent-skills   # optional: prebuilt Supabase migration/query skills
```

This must be run interactively in a real terminal on the user's machine (the auth step needs a live browser
login) — it can't be done unattended or from a restricted sandbox.

## 8c. Working with live data — safety rules

Once the Supabase MCP (§8b) is authenticated, Claude Code has direct read/write access to the real
production database behind this app — the same `notes`/`tasks`/`packets` rows the user actually uses day
to day, not a sandbox copy. That's a materially different level of risk than just writing code, and comes
with rules:

- All new migrations are additive only — new tables/columns, `CREATE TABLE IF NOT EXISTS` /
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, matching the style already used in `migrations/001-003`. Never
  alter or drop an existing table/column.
- Never run `DELETE`, `TRUNCATE`, `DROP`, or any `UPDATE` against existing `notes`/`tasks`/`packets` rows
  while building or testing this feature. The synthesis job only ever reads that data — it should never
  need to mutate it.
- Writes from this feature only ever target the new tables it introduces
  (`device_activity`, `activity_log`, `mind_insights`, `push_subscriptions`) — never existing ones.
- When testing a new query, run it read-only (`SELECT`) against the real data first, before wiring up
  anything that writes.
- If any step is destructive or hard to reverse — even one that seems obviously correct — stop and ask the
  user before running it. Don't rely on judgment calls alone when the data is live and personal.

## 9. Suggested build order

1. Migration for `device_activity`, `activity_log`, `mind_insights`, `push_subscriptions` (§2).
2. Wire `activity_log` writes into existing note/task/packet/focus routes (§ "activity_log" in §2) — this
   is independent of the extension and unlocks real in-app data immediately.
3. Browser extension + ingestion endpoint (§3).
4. Synthesis job reading real data, writing `mind_insights` (§4) — start with interest clusters + open
   loops + dormant revival, since those need the least judgment; inferred goals last since it's the
   riskiest to get wrong.
5. Dashboard page (§8) to see the output of #4 before adding notifications.
6. Push notification infra (§5) and the daily loop wiring (§6).
7. Goal-alignment reminders (§7), last, since it depends on everything else being trustworthy first.

## 10. If something's unclear

Ask rather than assume — especially anywhere this brief says "traceable," "mirror not oracle," or
"inferred, not asserted." Those constraints exist because this system handles genuinely personal data and
is meant to reduce the user's cognitive load, not add a new source of quiet, unverifiable judgments about
them.
