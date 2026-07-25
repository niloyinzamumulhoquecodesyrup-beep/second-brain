# Reminders & Alerts — Build Plan

The one true hole in the ADHD-support spec. Everything else (task management, gamified
motivation, fidget interaction, community) is at least partially built; reminders have
**no delivery mechanism at all**. Tasks carry a `due_date` (and now an optional
`start_min`/`duration_min`, per `023_task_scheduling.sql`), routines and planner blocks
carry times — but nothing ever *nudges* the user. The only thing called "reminders" today
is `ReminderRows` on the Mind page: passive, cycle-authored insight text you have to go
look at.

This plan adds gentle, personalized, low-pressure nudges without countdown pressure —
the spec's exact framing.

---

## Design principles (ADHD-safe, from the spec)

- **Gentle, not alarming.** Soft language and soft visuals. Never "OVERDUE!!" — prefer
  "When you're ready: …". No harsh sounds, no red countdowns.
- **Flexible, never punitive.** A missed reminder loses nothing. Snooze is first-class and
  frictionless. Nothing "breaks."
- **No countdown pressure.** Reminders point at a task/step; they don't impose a timer.
  (The pomodoro is opt-in and lives elsewhere.)
- **Personalized.** Respect quiet hours; lean on the user's real routine times rather than
  arbitrary defaults. Tie into existing `planner_routines` for time-of-day cues.
- **One at a time.** Batch/collapse so the user never faces a wall of notifications —
  a classic ADHD overwhelm trigger.

---

## What already exists to build on

- `tasks` — `due_date DATE`, `start_min`, `duration_min`, `completed_at`.
- `planner_routines` — `days[]`, `start_min`, `duration_min` (recurring times).
- `planner_blocks` — `plan_date`, `start_min`, `status` (concrete day entries).
- `activity_log` — generic event table (`event_type` is free text) — reuse for
  delivered/dismissed reminder events, no new logging infra needed.
- `lib/supabaseClient.js` + realtime (`postgres_changes`) — already used by MINDCORD /
  other-brains, so in-app live delivery has a proven pattern here.
- `planner_prompts` (`routine_suggestion` type) — a cycle already proposes turning a
  recurring, not-yet-fixed activity into a routine; §"Unscheduled activity nudges" below
  just gives that an actual notification instead of a chip you have to go find.
- `mind_topics` / note tags — the closest thing today to "the user is interested in
  birds/astronomy"; §"Interest-matched events" below reads from here.
- Latest migration is `028_user_profile.sql`, so new files start at **029**.

---

## Architecture — three layers

### 1. Data layer — `migrations/029_reminders.sql`

A single `reminders` table plus a small `notification_prefs` table.

```sql
-- 029_reminders.sql
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,

  -- what this reminder points at (all optional; at least one set, or none for a
  -- fully custom/cycle-authored one)
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  routine_id uuid REFERENCES planner_routines(id) ON DELETE CASCADE,
  block_id   uuid REFERENCES planner_blocks(id) ON DELETE CASCADE,
  -- a routine_suggestion nudge doesn't duplicate the suggestion payload -- it just
  -- points at the existing planner_prompts row and reuses that accept/dismiss flow
  prompt_id  uuid REFERENCES planner_prompts(id) ON DELETE CASCADE,

  -- gentle, human copy shown in the nudge (never auto-"OVERDUE"). Composed once at
  -- creation time (by the app for task/routine kinds, by the cycle for
  -- routine_suggestion/interest_event/custom kinds) rather than re-derived on read.
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,      -- e.g. { source_url, event_date } for interest_event
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,  -- traceability for cycle-authored candidates, same convention as para_fun_queue/planner_prompts

  -- when to fire. one-off uses fire_at; recurring uses rule + time_min.
  fire_at TIMESTAMPTZ,                 -- absolute one-shot
  recur_days INTEGER[],                -- 0=Mon..6=Sun, null = not recurring
  time_min INTEGER CHECK (time_min IS NULL OR (time_min >= 0 AND time_min < 1440)),

  -- lead offset so "remind me 10 min before a routine" works off routine.start_min
  lead_min INTEGER NOT NULL DEFAULT 0,

  kind TEXT NOT NULL DEFAULT 'custom'
       CHECK (kind IN ('task','routine','block','custom','routine_suggestion','interest_event')),
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('system','cycle','user')),
  status TEXT NOT NULL DEFAULT 'active'
       CHECK (status IN ('active','done','dismissed')),

  -- snoozing is orthogonal to status (status stays 'active' while snoozed) --
  -- simpler than a separate 'snoozed' status, and "done today" for a recurring
  -- reminder is just snooze_until = start of tomorrow, no extra state needed.
  snooze_until TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,           -- reserved for future recurring analytics; not load-bearing in v1
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user   ON reminders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_fire   ON reminders (fire_at) WHERE status='active';

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet_start_min INTEGER NOT NULL DEFAULT 1320,  -- 22:00
  quiet_end_min   INTEGER NOT NULL DEFAULT 480,   -- 08:00
  daily_surface_cap INTEGER NOT NULL DEFAULT 30,  -- percent; the cycle's own soft targeting heuristic, see "Volume control" below
  web_push_enabled BOOLEAN NOT NULL DEFAULT false
  -- no push_subscription column here -- push_subscriptions (004_mind_model.sql) already
  -- exists as its own table for that, unused until Phase B; no need to duplicate it
);
```

Follow the existing RLS pattern (`020_rls_lockdown.sql`) — enable row-level security on
both tables scoped to `user_id`, no policies (server bypasses via table-owner role, same
as every other table).

### 2. API layer — `pages/api/reminders/*`

Mirror the existing `pages/api/tasks` / `pages/api/planner` handler style
(`requireAuth`, `hasDb`, `getPool`).

- `GET /api/reminders` — list active reminders for the user, each row carrying a
  server-computed `due` boolean (fire time passed, not snoozed, not in quiet hours,
  not mid-Pomodoro — see "Do-not-disturb" below). No separate `/due` evaluator route:
  computing `due` as a field on the same list avoids two near-duplicate endpoints: the
  delivery poller just filters client-side on `due === true`.
- `POST /api/reminders` — create (attach to a task/routine/block/prompt, or a fully
  custom one). Cycle-authored inserts (`origin: 'cycle'`) are capped at a small absolute
  ceiling per rolling 24h as a hard backstop — see "Volume control" below.
- `PATCH /api/reminders/[id]` — `snooze` (set `snooze_until`), `done`, `dismiss`, and
  `accept` (routine_suggestion only — proxies to the same accept logic as
  `pages/api/planner/prompts/[id].js`, so a suggestion becomes a real `planner_routines`
  row through the one existing write path, never a second one).
- `GET/PUT /api/notification-prefs` — quiet hours + `daily_surface_cap` + push opt-in
  (defaults returned if no row exists yet; no write until the user actually changes one).
- `POST /api/activity/focus-state` — the live Pomodoro on/off signal (see "Do-not-disturb").

Auto-create convenience: when a task gets a `due_date`/`start_min` in
`pages/api/tasks`, the app inserts/updates a matching `reminders` row (`kind: 'task'`,
`origin: 'system'`) so the user doesn't have to set reminders by hand — "already
suggested, just tap" posture that the planner already uses. Completing the task marks
its reminder `done`; deleting the task cascades the reminder away for free.

### 3. Delivery layer — start in-app, add push later

**Phase A — in-app (ship first, no infra):**
A lightweight client poller (or Supabase realtime subscription on the `reminders` table,
reusing `lib/supabaseClient.js`) checks `/api/reminders/due` every ~60s while the app is
open. Due reminders surface as:
- a **bell badge** in `components/Layout.js` (count of active nudges), and
- gentle toast/inline cards on the **Work page** — soft color, snooze + "open task" +
  "done" inline, one at a time.

This alone closes the gap for anyone with the tab open, with zero external dependencies.

**Phase B — Web Push (works when the app is closed):**
Add a service worker + the Web Push API (VAPID keys in env alongside the existing
`SESSION_SECRET`/`DATABASE_URL`). Store the subscription in `notification_prefs.push_subscription`.
A scheduled job (Vercel Cron, since the app already targets Vercel per the README) hits an
internal `/api/reminders/dispatch` route each minute, evaluates due reminders server-side,
and sends pushes — honoring quiet hours. This is the "notify even when not looking" piece.
Optional: fold in the existing Cowork scheduled-tasks mechanism instead of Vercel Cron.

**Location-based cues** (the spec mentions them) are explicitly **out of scope for v1** —
they need native geofencing the web app can't do well. Note it as a "future / if this ever
becomes a mobile app" item rather than building a weak browser version.

---

## Volume control — most candidates never become a notification

Not every due task or approaching routine should page the user — that's exactly the
overwhelm the "one at a time" principle guards against. Reminders split into two
different *origins*, built differently:

- **Mechanical** — a task's due time arrives, a routine's start time approaches. No
  judgment; the evaluator just checks the clock. These always surface (the user
  explicitly set them).
- **Cycle-authored** — the three items below (unscheduled-activity nudges,
  interest-matched events, and implicitly anything else a future cycle proposes)
  require judgment: is this worth interrupting the user for? That judgment isn't a
  live per-request call — it's made by the same periodic refresh cycle that already
  writes `mind_insights` / `planner_prompts` / `para_fun_queue`, reading the user's
  data with real discretion rather than a formula.

`notification_prefs.daily_surface_cap` (default 30, a percent) is the cycle's own
targeting heuristic: of everything it *could* surface in a run, it aims to actually
write reminder rows for roughly that fraction, biased toward fewer on a quiet day
rather than padded up to hit the number on a light one. That's a soft, judgment-based
target — there's no code enforcing "30% exactly," because there's no reliable
denominator ("everything considered") to enforce it against.

What *is* enforced in code is a hard backstop: `POST /api/reminders` rejects new
`origin: 'cycle'` rows once 5 have been created for that user in the trailing 24
hours. A misbehaving or over-eager cycle run can't flood someone regardless of what
its own judgment concluded.

---

## Unscheduled activity nudges ("you did swim again — lock it in?")

Reuses `planner_prompts` (`routine_suggestion`) end-to-end rather than inventing a
parallel mechanism. Today, a cycle can already notice "this keeps happening ad hoc but
was never turned into a fixed routine" and leave a suggestion chip sitting in the
Planner tab — easy to miss because nothing points at it. The only change: when the
cycle writes that kind of suggestion, it *also* writes a `reminders` row
(`kind: 'routine_suggestion'`, `prompt_id` pointing at the prompt, `origin: 'cycle'`),
so it surfaces as an actual nudge:

> *"Swim's happened three Tuesdays running — want to lock it in for next week too?"*
> **Yes, add it** / **Not now**

"Yes" hits `PATCH /api/reminders/[id]` with `action: 'accept'`, which runs the exact
same insert `pages/api/planner/prompts/[id].js` already uses to turn a suggestion into
a real `planner_routines` row — never a second, divergent write path. "Not now"
dismisses both the reminder and the underlying prompt.

Note on scope: the app supplies the schema, the API, and the UI to display/act on this
kind of reminder. Actually *noticing* the pattern and writing the `routine_suggestion`
prompt in the first place is the cycle's job (an external, periodic Claude Code
process reading real note/activity data) — not something this codebase runs
automatically as a server process.

---

## Interest-matched events (birds, astronomy, whatever the user's into)

Same cycle-authored path, different source: the cycle reads what the user is actually
interested in (`mind_topics`, tags, note content — whatever the Mind system has
already inferred) and, when it runs, checks whether anything timely and genuinely
relevant turns up — a meteor shower, a local birding walk. If there's a good match, it
writes a `reminders` row (`kind: 'interest_event'`, `origin: 'cycle'`, `payload: {
source_url, event_date }`):

> *"Meteor shower peaks Thursday night — thought you'd want to know."*

Same volume-control rules apply (counts toward the 30% target and the 5/day hard cap).
Honest caveat: this one depends on the cycle actually having something to check
against — a rough location (user-set in Settings, **never inferred/guessed**) and some
way to look up real events (web search during the cycle run). It's "once a cycle, if
something genuinely relevant turns up, mention it once" — not a live "poll an events
API every minute" system.

---

## Do-not-disturb: quiet hours + mid-Pomodoro

Every reminder, mechanical or cycle-authored, passes through the same delivery-time
gate before it counts as `due`:

- **Quiet hours** — `notification_prefs.quiet_start_min` / `quiet_end_min` (default
  22:00–08:00). Nothing fires during the window; it just waits until the window ends.
- **Mid-focus-session** — while a Pomodoro is running, nothing fires either, same
  "just waits" behavior.

The Pomodoro gate needs one small addition beyond what exists today: focus-session
state (`components/FocusPomodoro.js`) currently lives only in the browser
(`lib/focusSession.js`, localStorage) and is only reported to the server *after* a
session ends, for logging (`POST /api/activity/focus`). That's enough for in-app
delivery (the same tab already knows a Pomodoro is running and can just suppress its
own toast locally) but not enough for a future Web Push dispatch running server-side
with no visibility into the browser at all. The fix: starting a Pomodoro immediately
posts `POST /api/activity/focus-state` with `{ active: true, ends_at }`; pausing,
resetting, switching mode away from `'pomodoro'`, finishing, or exiting posts
`{ active: false }`. The evaluator reads the latest such event and treats
`active && ends_at > now` as suppressed — same posture as quiet hours, nothing lost,
it delivers normally once the session ends (or `ends_at` naturally passes, if the tab
was just closed mid-session without a clean stop signal).

---

## UI surfaces

- **Work page** (`pages/work.js`): a "Nudges" strip above `TasksPanel` — the due reminders,
  gentle copy, inline snooze/done. This is where reminders become *active* instead of
  passive.
- **Bell in `Layout.js` nav**: unread nudge count, opens a small reminder inbox.
- **On each task** (`TasksPanel`/`TodayCards`): a small "remind me" control — pick "at due
  time", "morning of", "10 min before", or a custom time. Reuses the `<input type="date">`
  pattern already in `TasksPanel`.
- **Settings**: quiet hours + "enable notifications" toggle (drives the Phase B push opt-in).

---

## Suggested build order

1. `029_reminders.sql` + RLS, run via `npm run migrate`.
2. `/api/reminders` CRUD (with computed `due` + the cycle-origin 5/day cap) + prefs
   endpoint + `/api/activity/focus-state`.
3. Auto-create on task due-date set/change/complete.
4. Pomodoro start/stop wired to the live focus-state signal.
5. In-app delivery: real bell badge + toast + Work-page nudge strip (Phase A),
   replacing `DEMO_REMINDERS`/`emulateNotification` in `components/Layout.js`.
   **← closes the gap.**
6. Quiet-hours settings.
7. Web Push service worker + Vercel Cron dispatch (Phase B) — not built yet.
8. The cycle itself actually authoring `routine_suggestion`/`interest_event` rows —
   schema/API/UI support ships in this pass, but populating them is a periodic,
   external Claude Code cycle run, same as `mind_insights` today, not application code.
9. Verify: create a task due in 2 min → confirm nudge fires, snooze works, quiet hours
   suppress, starting a Pomodoro suppresses, nothing reads as punitive.

Steps 1–6 are what this build pass implements — the minimum that turns "no reminders"
into "gentle, real, delivery-gated reminders." Steps 7–8 are still reach: closed-app
push needs its own infra decision (VAPID keys, a cron host), and the two cycle-authored
candidate kinds need an actual cycle run against real user data to populate, which is a
separate exercise from building the pipes for them.
