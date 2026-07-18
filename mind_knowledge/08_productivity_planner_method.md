# Productivity planner method — co-authoring the day/week planner each cycle

The Productivity support tab (Mind page) is a day/week planner the user manipulates directly —
draggable time blocks for one day, a routine skeleton materialized across the week, pie charts of how
each day's 24h (and the week's 168h) are spent, sleep included. The cycle's job there is narrow and
conversational: ask the right question when evidence is missing, and place good suggestions at
concrete times. The user's hand does everything else.

## The three tables

- **`planner_routines`** — the recurring skeleton ("sleep at 23:00 daily", "gym Mon/Wed/Fri";
  `days` is `int[]`, 0=Mon..6=Sun; times are minutes from midnight). **Never INSERT or UPDATE this
  table.** A routine only comes to exist when the user types one in or taps an accept control in the
  app; a cycle's route into it is a `routine_suggestion` prompt (below).
- **`planner_blocks`** — concrete entries pinned to one `plan_date`. A cycle may only ever write rows
  with `status='suggested'` and `source='cycle'`; they render as dashed ghost bars sitting at the
  proposed time, inert until the user accepts, retimes, or dismisses them. Rows with status
  `active`/`done`/`skipped` belong to the user — never create or edit them. Blocks with a
  `routine_id` are per-day materializations of a routine (the user moved or completed that day's
  occurrence) — read them as behavioral signal, don't touch them.
- **`planner_prompts`** — the conversation. `prompt_type='question'` (with `options`) when a real
  evidence gap blocks a better suggestion; `prompt_type='routine_suggestion'` with a complete
  `suggestion` payload `{"title", "category", "days", "start_min", "duration_min"}` when the evidence
  already supports a recurring habit. `status='answered'` rows are user-provided ground truth: read
  every answered row each cycle and turn what it says into structure (routine_suggestions, suggested
  blocks) before writing anything new. The standing first-run question "What do you do on a regular
  basis?" arrives here as a pre-answered free-text row — parse it into concrete routine_suggestions
  (sleep/wake times, meals, exercise days) rather than leaving it to rot.

`category` is one of `sleep | work | study | exercise | meals | leisure | other` — it drives the pie
charts, so pick honestly (a "study Spanish" block is `study`, not `leisure`).

## What makes a good suggestion

Ground every suggestion in evidence and cite it in `source_refs` — a task with a due date becomes a
suggested work block on a real date before the deadline; recurring swim mentions in notes become a
"which days do you swim?" question first, then swim blocks on the answered days; an inferred_goal
with no scheduled time becomes a suggested study block at an hour the activity_log says the user is
usually active. Respect the existing schedule: never place a suggestion overlapping an active block
or routine occurrence on that date, and prefer the user's demonstrated rhythm (when do their notes
and completions actually happen?) over generic productivity lore. The adhd_support_map rules apply
here with full force: suggestions are offers, not verdicts — no shame framing, no "you failed to",
no stacking a missed day into a bigger ask.

## Caps and hygiene, every cycle

- At most **2-3 new suggested blocks** and **1-2 new prompts** per cycle — an over-planned day is
  worse than an empty one.
- Don't re-suggest anything already pending, or dismissed within the last two weeks — a dismissal is
  an answer.
- Mark your own stale `suggested` blocks whose `plan_date` has passed as `dismissed`.
- No routines and no answered prompts yet? Skip suggestions entirely; the app already shows the
  standing question and starter chips.
- Write back `scope='user'` calibration rows to `mind_knowledge` as acceptance patterns emerge
  ("evening suggestions get accepted, early-morning ones dismissed") so the next cycle places better.
