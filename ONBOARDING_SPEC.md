# In-App Onboarding — Build Spec

A build plan for the first-run experience, grounded in the components that already exist.
The goal is **not** a rewrite — it's to extend the current flow so it introduces the
ADHD-support layer (the Work page: tasks, planner, focus, rewards), which today's
onboarding never mentions.

---

## What exists today (two phases)

**Phase 1 — `components/Onboarding.js` (personalization).**
A first-run wizard over an `EclipseAnimation` backdrop:
`hello → name → age → persona → imports → done`. The user pastes up to 5 knowledge
sources (chat / document / kanban / journal / calendar). Writes `display_name`, `age`,
`persona`, `onboarded_at` to `users` and rows to `onboarding_imports`.
APIs: `GET /api/onboarding/status` (`onboarded` flag), `POST /api/onboarding/complete`.

**Phase 2 — `components/TourProvider.js` + `components/TourOverlay.js` (guided tour).**
A one-time, forced, *simulated* tour that runs right after onboarding:
`TOUR_STEPS = ['welcome','capture','organize','distill','express','summary']`, mapped by
`TOUR_PATH` to `/mind` and `/`. Overlays render typing-mockups (`TypingField`) — **no real
notes/tasks are written**. Progress persists in `localStorage` (`sb_tour_step`); a
skip-ahead lock in `TourProvider` `router.replace`s back to the expected page. Status via
`GET /api/tour/status` + `POST /api/tour/complete`; `active = (tour_completed_at IS NULL)`.

---

## The gap

The tour teaches only the **CODE/PARA knowledge side** (Capture → Organize → Distill →
Express → Mind). It never introduces the **Work page** — tasks, the routine planner, focus
pomodoro, and the reward system — which is the app's actual ADHD-support core. It also
predates the current nav (`Work / Organize / Mind / MINDVERSE` in `Layout.js`): tour steps
still point `capture/organize/distill/express` all at `/`, and there is no `work` step.

**So the onboarding sells the second-brain, but a new ADHD user never sees the part built
for them.** Closing that is the whole job.

---

## Goal

Extend both phases so a first-run user (a) is greeted in ADHD-support framing, and (b) is
walked through the Work page — with the same simulated, no-real-data, skip-locked posture
the tour already uses. Reuse everything; add one new tour segment.

---

## ADHD-safe onboarding principles

- **Short and skippable.** Each step is one idea, one action. "Skip for now" stays visible
  (the imports step already models this). Never trap the user.
- **Low cognitive load.** One question / one panel per screen — the current wizard already
  does this; keep it.
- **Show, don't lecture.** Continue the simulated-mockup approach (`TypingField`) rather
  than walls of text.
- **Calm, encouraging copy.** No pressure, no "complete your profile!" nagging. Match the
  gentle voice already in `RewardPanel` quotes.
- **Resumable.** Keep the `localStorage` step persistence so a reload never restarts from
  zero.

---

## Proposed flow (revised)

### Phase 1 — Onboarding.js (light touch)
Keep the wizard. Two small changes:
1. **Reframe the hello/persona copy** toward focus/organization support (currently
   "initiate your second brain"). Persona options already include "Just getting organized"
   — add an ADHD/"focus & follow-through" leaning option if desired, but the structure is
   fine as-is.
2. No schema change. `persona` already captures the self-description the Mind cycle uses.

### Phase 2 — Tour (add a Work segment)
New step sequence:

```
welcome → work → capture → organize → distill → express → summary
```

`work` is inserted right after `welcome` so the user meets the "doing" side **before** the
knowledge-management side — it's the more immediately useful surface for the target user.
The `work` step is one overlay on `/work` demoing, via simulated mockups:
- a **task** being checked off (reuse `CompletionCelebration` for the tick),
- a **Today card** on the planner,
- the **focus** ring (one line, not a full pomodoro),
- the **reward gauges** filling (tie into the reward system once built — until then, a
  static mockup).

Keep every step simulated: no real tasks/routines written, consistent with the existing
`TourOverlay` contract.

---

## Component-level changes — reuse vs. new

**Reuse / edit (no new files):**
- `components/TourProvider.js` — add `'work'` to `TOUR_STEPS` and `work: '/work'` to
  `TOUR_PATH`. The skip-ahead lock, localStorage persistence, and `active` logic all keep
  working unchanged (they're array-driven).
- `components/TourOverlay.js` — add a `work` entry to `STEP_CONTENT` (title, body, demo
  mockup, cta) and mount `<TourOverlay step="work" />` on the Work page. Update the
  existing step CTAs so ordering reads correctly (`welcome` → "Next: Your workspace").
- `pages/work.js` — render the `work` `TourOverlay` (mirror how `pages/index.js` mounts
  `capture/organize/distill/express` overlays).
- `components/Onboarding.js` — copy/reframe only.
- `GET /api/tour/status`, `POST /api/tour/complete`, `/api/onboarding/*` — unchanged.

**New:**
- Nothing structural. The only genuinely new asset is the `work`-step mockup markup inside
  `TourOverlay` and its mount on `pages/work.js`.

**New API / migration:**
- **None required for v1.** The tour is array-driven and status is a single boolean; adding
  a step needs no schema. Only add a migration if you later want *per-segment* completion
  (e.g. "seen Work tour but not Knowledge tour") — a `tour_progress JSONB` column on
  `users` — which is Phase 2 polish, not needed now.

---

## A note on ordering with the other plans

The reward gauges are the richest part of the `work` tour step. If `REWARD_SYSTEM_PROMPT.md`
ships first, the tour can demo the real panel; if not, use a static mockup and swap later.
No dependency blocks the onboarding work — it can land independently with a placeholder.

---

## Build order

1. `TourProvider`: add `work` to `TOUR_STEPS` + `TOUR_PATH`. (One-line-ish change.)
2. `TourOverlay`: add `work` `STEP_CONTENT` with a simulated demo; fix CTA wording across
   steps.
3. `pages/work.js`: mount `<TourOverlay step="work" />`.
4. `Onboarding.js`: reframe hello/persona copy toward focus/organization support.
5. Verify (below).

## Acceptance checks

- A fresh account runs `Onboarding` → tour starts at `welcome` → **`work` step appears
  next**, on `/work`, before the knowledge steps.
- The skip-ahead lock still holds: manually navigating away mid-tour returns to the
  expected step; reload resumes at the saved step.
- No real tasks/notes/routines are written by the tour (still fully simulated).
- `POST /api/tour/complete` fires once at `summary`; the tour never re-shows.
- Copy is calm and skippable throughout; nothing reads as pressure.
