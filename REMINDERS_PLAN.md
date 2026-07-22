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
- Latest migration is `024_task_pieces.sql`, so new files start at **025**.

---

## Architecture — three layers

### 1. Data layer — `migrations/025_reminders.sql`

A single `reminders` table plus a small `notification_prefs` table.

```sql
-- 025_reminders.sql
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,

  -- what this reminder points at (all optional; at least one set)
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  routine_id uuid REFERENCES planner_routines(id) ON DELETE CASCADE,
  block_id   uuid REFERENCES planner_blocks(id) ON DELETE CASCADE,

  -- gentle, human copy shown in the nudge (never auto-"OVERDUE")
  message TEXT,

  -- when to fire. one-off uses fire_at; recurring uses rule + time_min.
  fire_at TIMESTAMPTZ,                 -- absolute one-shot
  recur_days INTEGER[],                -- 0=Mon..6=Sun, null = not recurring
  time_min INTEGER CHECK (time_min IS NULL OR (time_min >= 0 AND time_min < 1440)),

  -- lead offset so "remind me 10 min before a routine" works off routine.start_min
  lead_min INTEGER NOT NULL DEFAULT 0,

  kind TEXT NOT NULL DEFAULT 'task'
       CHECK (kind IN ('task','routine','block','custom')),
  status TEXT NOT NULL DEFAULT 'active'
       CHECK (status IN ('active','snoozed','done','dismissed')),

  snooze_until TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,           -- so recurring fires once per occurrence
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user   ON reminders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_fire   ON reminders (fire_at) WHERE status='active';

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet_start_min INTEGER DEFAULT 1320,  -- 22:00
  quiet_end_min   INTEGER DEFAULT 480,   -- 08:00
  web_push_enabled BOOLEAN DEFAULT false,
  push_subscription JSONB                -- Web Push subscription object, if opted in
);
```

Follow the existing RLS pattern (`020_rls_lockdown.sql`) — enable row-level security on
both tables scoped to `user_id`.

### 2. API layer — `pages/api/reminders/*`

Mirror the existing `pages/api/tasks` / `pages/api/planner` handler style
(`requireAuth`, `hasDb`, `getPool`).

- `GET /api/reminders` — list active + snoozed for the user (for the bell/inbox).
- `POST /api/reminders` — create (attach to a task/routine/block or a custom one).
- `PATCH /api/reminders/[id]` — snooze (set `snooze_until`), dismiss, mark done, edit time.
- `GET /api/reminders/due` — the **evaluator**: returns reminders whose fire time has
  passed (respecting quiet hours + snooze), and stamps `last_fired_at`. This is the one
  endpoint the delivery layer polls.
- `GET/PUT /api/notification-prefs` — quiet hours + push opt-in.

Auto-create convenience: when a task gets a `due_date`/`start_min` in
`pages/api/tasks`, optionally insert a matching `reminders` row (default lead time from
prefs) so the user doesn't have to set reminders by hand — "already suggested, just tap"
posture that the planner already uses.

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

1. `025_reminders.sql` + RLS, run via `npm run migrate`.
2. `/api/reminders` CRUD + `/api/reminders/due` evaluator + prefs endpoint.
3. In-app delivery: Work-page nudge strip + Layout bell (Phase A). **← closes the gap.**
4. "Remind me" control on tasks + auto-create on due-date set.
5. Quiet-hours settings.
6. Web Push service worker + Vercel Cron dispatch (Phase B).
7. Verify: create a task due in 2 min → confirm nudge fires, snooze works, quiet hours
   suppress, nothing reads as punitive.

Phases 1–3 are the minimum that turns "no reminders" into "gentle working reminders."
Everything after is reach (closed-app push, auto-suggestion, settings polish).
