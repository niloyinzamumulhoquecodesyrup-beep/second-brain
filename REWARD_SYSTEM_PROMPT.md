# Build Prompt — Multi-Dimensional Reward System on the Work Page

Paste this to an implementation agent (or use as your own spec). It is written against
the real code in this repo.

---

## Context

This is a Next.js (pages router) + Postgres "Second Brain" app with an ADHD-support layer.
Build a **task-completion + multi-dimensional reward system** and surface it on the **Work
page** (`pages/work.js`, which currently renders only `TasksPanel` + `RoutinePlanner`).

A `components/RewardPanel.js` already exists but is **an orphan — imported nowhere**. It
already contains: a positive `computeStreak`, a `BADGES` list, a `TankGauge` SVG (a
glass-tube fill gauge), a rotating `QUOTES` block, and four gauges (Streak / Captures /
Tasks done / Focus sessions). **Reuse and extend it — do not rewrite from scratch.**

Data is already available from `GET /api/stats`, which returns: `totalNotes`, `tasksDone`
(lifetime), `focusSessionsTotal` (lifetime), plus 21-day daily arrays `capturesByDay`,
`tasksDoneByDay`, `focusSessionsByDay`. `activity_log` records `task_completed` and
`focus_session` events. `CompletionCelebration.js` already fires a check-mark burst on
completion.

Design constraint from `NOTES.md` (2026-07-20): **"make it much simpler."** Favor four
clear dimensions over a sprawling RPG. Keep it calm.

---

## The dimensions (fixed set of 4)

Each maps to a signal already being logged. No new tracking needed for v1.

| Dimension        | Signal (source)                    | Lifetime total from `/api/stats` |
|------------------|------------------------------------|----------------------------------|
| **Follow-through** | tasks completed (`task_completed`) | `tasksDone`                      |
| **Focus**          | focus sessions (`focus_session`)   | `focusSessionsTotal`             |
| **Consistency**    | active-day streak (`computeStreak`)| derived from the daily arrays    |
| **Capture**        | notes captured                     | `totalNotes`                     |

(Optional 5th, **Planning** = planner blocks marked `done` — SKIP in v1; it needs a new
`plan_completed` event in the planner API. List it as a stretch item only.)

---

## Mechanics (research-backed, ADHD-safe)

1. **Per-dimension levels.** Each dimension has a level derived from its lifetime total via
   a gentle rising curve, e.g. thresholds `[0,3,8,15,25,40,60,85,120,...]` (level = count of
   thresholds passed). Show the level number + a small progress bar toward the next level,
   alongside the existing `TankGauge` (which stays as the *today* view). So each dimension
   shows: today's fill (gauge) **and** lifetime level (bar).
2. **Adaptive soft targets.** Replace the hard-coded gauge targets (3 / 7) with a target
   nudged from the last ~7 days' median for that dimension (min 1, never punitive). Keep it
   reachable so the tank can actually fill and glow.
3. **Variable / surprise bonus.** On a completion, occasionally (≈15% chance, or on hitting
   a fresh level) fire a bigger celebration: reuse `CompletionCelebration` but with a
   "bonus" variant + a rare surprise badge/quote. Variable-ratio, not every time.
4. **Immediate feedback on the exact action.** When a task is checked off, animate the
   Follow-through gauge tick up right then, and show which dimension gained.
5. **No punishment — ever.** Streaks pause, never "break" (keep the existing today-or-
   yesterday logic). Missing a day removes nothing already earned. No red, no "overdue,"
   no decay. Copy stays "you're in motion," never "you fell behind."

---

## Reuse vs. new — the explicit breakdown

**Reuse (no changes beyond extension):**
- `components/RewardPanel.js` — extend: add level + next-level bar under each `TankGauge`,
  adaptive targets, surprise-bonus trigger. Keep `TankGauge`, `BADGES`, `QUOTES`,
  `computeStreak`.
- `components/CompletionCelebration.js` — add an optional `variant="bonus"` prop for the
  surprise burst.
- `GET /api/stats` — already returns every lifetime total and daily array needed. **Levels
  and targets are computed client-side; no read-side API change required.**

**New — mount only:**
- `pages/work.js` — import `RewardPanel` and render it **above** `TasksPanel`, fetching
  `/api/stats` (same shape the dashboard already uses). This is the main visible change.

**New API / migration — ONLY if you want persistence beyond derivable stats:**
- Not required for v1. Everything above is computable from existing data.
- Add a `025_rewards.sql` (next free migration; current max is `024`) **only** for optional
  extras: a `reward_events` log (to persist which surprise bonuses/level-ups were already
  shown so they don't re-fire on reload) and/or a redeemable "reward shop" with a spendable
  balance. Treat as Phase 2.
  - Note: the Reminders plan also proposed `025`. Whichever ships first takes `025`; the
    other becomes `026`.

---

## UI layout (Work page)

```
[ Work — "What's on today" ]
[ RewardPanel ]  ← new mount
   ├─ left:  streak headline + earned badges + rotating quote (existing)
   └─ right: 4 dimension columns, each = TankGauge (today) + "Lv N" + next-level bar
[ TasksPanel ]   (existing)
[ RoutinePlanner ] (existing)
```

Keep the panel visually quiet — one card, soft gold top border like the current
`RewardPanel`. Four columns on desktop, 2×2 on mobile.

---

## Build order

1. Extend `RewardPanel`: per-dimension level + next-level bar; adaptive targets.
2. Mount `RewardPanel` on `pages/work.js` with a `/api/stats` fetch.
3. Wire the surprise-bonus variant into `CompletionCelebration` and trigger it from the
   task check-off path (`TasksPanel`/`TodayCards`).
4. (Phase 2, optional) `025_rewards.sql` + `/api/rewards` to persist shown level-ups and a
   redeemable balance.
5. Verify: complete a task → Follow-through gauge ticks live, level bar advances, occasional
   bonus fires; miss a day → nothing turns red or resets; targets stay reachable.

## Acceptance checks

- Reward panel visible on Work, four dimensions, each showing today-fill + level.
- Completing a task updates the relevant gauge immediately without a full reload.
- No state, copy, or color anywhere reads as punitive.
- No new migration required for the core; stats API untouched on the read path.
