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

## 3. Browser extension (activity capture) — DEFERRED

Not being built for now. `device_activity` stays empty; the synthesis job (§4) must not depend on it being
populated. Revisit this section later if OS/browser-level tracking becomes wanted — the table and ingestion
design below are still the plan for when that happens.

### (deferred) original spec

Manifest V3 Chrome extension. Tracks the active tab's URL, domain, page title, and focused duration —
pause the timer on tab blur or when the OS reports idle. Batches events locally in extension memory/
`chrome.storage.local` only as a send buffer (not permanent local storage — flush and clear on successful
POST), and posts to a new authenticated endpoint on this app, e.g. `POST /api/activity/ingest`, which
writes into `device_activity`. Auth: reuse the existing session cookie/JWT scheme if the extension can hold
a long-lived personal token issued by the app (add a simple token-issuing route gated behind the existing
login), rather than inventing a second auth system.

## 4. Synthesis job — "Mind Model v1"

`device_activity` is empty for now (§3 deferred) — do not treat sparse/missing device activity as a bug.
For the current build, the job reads everything else that already exists for the account: `activity_log`,
`notes` (including tags, para bucket, content, distilled/status, timestamps), `tasks`, `packets`, and
`note_links`. This is already a real, rich signal on its own — capture/edit timestamps, PARA movement,
tagging, what got distilled vs. abandoned, task completion latency, focus session durations. Wire in
`device_activity` later as an additional input if/when §3 is ever built; nothing in the design below should
require it to be present.

A job (script or route, triggered by §6's daily loop) that reads the sources above for the account and
computes, writing results into `mind_insights`:

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

## 4a. Logical overview — written by Claude Code, on demand, no API key

A new `mind_insights` kind: `overview`. Unlike the other four kinds (template-generated strings from query
results), this one is a short written paragraph — but it is produced by Claude Code itself, in an
interactive session, not by the app calling out to an LLM API automatically. No `ANTHROPIC_API_KEY`, no
embedded LLM call in the app's code. The actual flow, as the user specified it:

1. The user asks Claude Code (in a terminal, with the Supabase MCP connected) to read all the data for
   their account — notes, tasks, packets, activity_log, and the current template-generated `mind_insights`
   rows.
2. Claude Code reads that data and writes the overview paragraph itself, using its own reasoning — this is
   the "summary," and it must still follow the mirror-not-oracle rule (§1): describe patterns, don't
   recommend actions or tell the user what to prioritize.
3. Claude Code pushes the result directly into Postgres — an `INSERT INTO mind_insights (user_id, kind,
   summary, source_refs) VALUES (..., 'overview', ..., ...)` — using its own Supabase MCP write access. No
   separate ingestion endpoint or app code needed for this step; Claude Code already has the DB connection.
4. The app's job is just to show what's there and prompt for a refresh (§6) — it does not generate this
   insight itself.

`source_refs` for the `overview` row should list the ids of the specific `mind_insights` rows (and/or
notes) it was drawn from, same as the other kinds — so it's traceable, not just prose Claude Code invented.

Schema change required: `mind_insights.kind` CHECK constraint needs `overview` added as an allowed value —
new migration (`005_mind_overview.sql`), following the same `DROP CONSTRAINT` / `ADD CONSTRAINT` pattern
`003_inbox.sql` used to extend `notes.para`. Do not edit `004_mind_model.sql` in place.

On the dashboard (§8), this is the top-of-page field — the other four kinds render below it as the
supporting detail/evidence it was drawn from.

## 4b. Personality model & research layer — "What You Might Do"

Two new `mind_insights` kinds: `user_model` and `recommendation`. Both are written by Claude Code in the
manual loop (§6), same as `overview` — no API key, no automated job. Requires another migration
(`006_mind_personality.sql`) extending the `kind` CHECK constraint, same pattern as §4a.

**`user_model` — the internal picture of the user.**

- **Self-directed, not user-directed.** The user never specifies what to learn about them ("assess my
  learning style," "track my focus patterns"). The system carries its own built-in map of what is worth
  understanding about a person in service of the end goal (helping them become better at what they're
  trying to do): e.g. learning style, focus/attention rhythms, motivation drivers, follow-through
  patterns, breadth-vs-depth tendency, what they abandon vs. finish. Claude Code works through that map on
  its own initiative — the "figure out what to figure out" step is already figured out, by design.
- **Data-volume-aware depth.** Before drawing any conclusion, judge how much data actually exists. Little
  data → only light, conservative observations. More accumulated data → deeper, more confident
  characterization, layered in over time. There is no single fixed method — the tier of analysis is chosen
  from what the data supports, never beyond it. Overreach on thin data is a bug.
- **Visible and correctable.** Every `user_model` row has `source_refs`, renders on the dashboard, and is
  framed as "based on these N notes/events, it looks like..." — the user can see it and correct it. Use
  `superseded_by` to layer newer reads over older ones rather than overwriting history.

**`recommendation` — research-backed "What You Might Do."**

- **Real, credible research — not shallow summaries or generic advice.** When Claude Code produces a
  recommendation, it goes and finds the actual respected thing: a specific named course (e.g. Coursera's
  "Learning How to Learn" for learning itself), an established methodology, a real expert framework. The
  point is that it does the digging most people don't do or don't know how to do.
- **Confidence split.** Facts about the world ("this course exists, this method is well-regarded") are
  verifiable — state them plainly and confidently, with the source named so the user can check. Whether
  the user should act on it stays their call — the mirror-not-oracle rule (§1) applies to prioritization,
  never watered down into hedging about the resource itself.
- **Research is dual-purpose.** What Claude Code learns while researching a topic, and how the user
  responds to what it surfaces (acted on, ignored, corrected), also feeds back into `user_model` — the
  flow is research → recommendation *and* research → better understanding of the user.
- `source_refs` on a `recommendation` points at the notes/insights that motivated it; external sources
  (course URLs, papers) go in the `summary` text or a `metadata` field so they're user-checkable.

On the dashboard (§8), `user_model` and `recommendation` render as their own SEPARATE groups below the
four template kinds — "How you seem to work" (`user_model`) and "What you might do" (`recommendation`
only, with an honest empty state like "no recommendation researched yet" when none exists — never
filled with user_model prose). Each kind has one job and must not restate another kind's content:
overview = what happened (stats live there), user_model = patterns beyond restated counts,
recommendation = researched external resources/paths. Full rule in
`mind_knowledge/03_refinement_loop.md` ("Role separation").

## 4c. `mind_knowledge` — the RAG-style methodology store

Claude Code runs the refresh loop (§6) with no memory of the conversations that designed this system.
Its entire "how to do this job" knowledge must therefore live in the database, retrieved at the start of
every cycle — a RAG store it also writes refinements back into.

New table (migration `007_mind_knowledge.sql`):

- **`mind_knowledge`** — `id`, `user_id`, `scope` (`general` | `user`), `topic` (short slug, e.g.
  `meta_map`, `learning_path_method`), `content` (text, markdown), `source_urls` (jsonb array),
  `created_at`, `updated_at`.

**Seed content already exists** in the repo at `mind_knowledge/*.md` — four researched methodology docs
(written 2026-07-13, sources embedded):

- `00_meta_map.md` — what to figure out about the user, tiered by data volume; the "figure out what to
  figure out" step, pre-figured. Includes the learning-styles-myth prohibition and the evidence-backed
  dimensions to model instead (prior knowledge, self-regulation, motivation, follow-through).
- `01_learning_path_method.md` — how to build learning paths/roadmaps/mind maps: metalearning
  (why/what/how, concepts-facts-procedures), established roadmaps first (roadmap.sh, syllabi),
  prerequisite sequencing vs. chaining, directness/drilling, retrieval+spacing baked into nodes, and the
  JSON `path` metadata format the dashboard can render as a tree/mind map.
- `02_resource_research_method.md` — keyword strategy (community-consensus queries first), credibility
  checklist, confidence split, required output fields (`keywords_used`, why-this-one, runners-up).
- `03_refinement_loop.md` — the per-cycle protocol: retrieve → apply → refine user-scope calibrations →
  conservatively refine general-scope methods, with provenance and changelog rules.

Seeding: after creating the table, insert each doc as one `scope='general'` row (`topic` from filename,
`content` = file text, `source_urls` = the URLs cited in that doc). The DB copy is canonical after
seeding — refinements happen in the DB, the repo files are just the initial seed.

Loop requirement (add to §6): before writing any `user_model` or `recommendation` insight, Claude Code
MUST first read all `mind_knowledge` rows and follow them; after writing insights, it writes back
`scope='user'` calibration rows per `03_refinement_loop.md`. Re-derive the user from live data every
cycle — user-scope rows store lessons about *how to read this user*, not cached summaries of them.

## 4d. "PARA method made fun" — Tab 2 on `/mind`

`/mind` gets a second tab alongside the existing overview (§8) — call it "PARA, made fun." One note (or one
proposed new capture), one question at a time, big tappable buttons, not a form. Each card shows a
question, the AI's suggested answer highlighted as the default choice, a couple of alternatives, and always
an explicit "skip" / "write my own." Tapping an answer immediately performs the real underlying write (moves
`para`, sets `executive_summary` + `distilled`, creates a task, or — new, per correction below — creates a
new note) through the app's existing write paths. It advances the note through Capture → Organize → Distill
→ Express; it isn't a quiz layered on top of separate real actions.

**Correction: assumed answers can propose new captures, not just act on existing notes.** While Claude Code
processes the account (during the same refresh cycle as §6), if it notices something worth capturing that
doesn't exist yet — a follow-up idea, a gap, something surfaced by research in §4b — it can queue that as a
question too: "Want me to capture '<draft title>' as a new note?" This means the question types are not a
fixed list I hand down; Claude Code should propose new question types/captures on its own initiative when
useful, the same self-directed principle §4b already established for `user_model`.

**Hard invariant, no exceptions: nothing is ever written to `notes`/`tasks`/`packets` without the user
tapping an answer.** A proposed capture is a queue row, not a note. This is what keeps an AI that can now
originate content from turning into an AI that quietly edits the user's knowledge base — the queue is the
airlock.

**Reconciliation, not blind regeneration.** This queue is processed by the *same* refresh loop as §6/§4b —
it is not a separate feature that ignores prior state. Each cycle: read existing `para_fun_queue` rows
first. Leave still-valid pending ones alone (don't duplicate or re-ask). Supersede ones the underlying data
has outgrown (note got edited, task got added some other way, etc.). Only then add genuinely new questions.
Same supersede-don't-destroy pattern as `mind_insights`.

**Schema** (new migration, e.g. `008_para_fun.sql`, additive per §8c):

- **`para_fun_queue`** — `id`, `user_id`, `note_id` (nullable — null for a `new_capture_proposal`),
  `question_type` (open text, not a fixed enum — Claude Code can introduce new ones), `question_text`,
  `options` (jsonb), `assumed_answer` (jsonb — for a capture proposal, the draft title/content), `section`
  (AI-assigned grouping, e.g. "Still in Inbox," "Missing a summary," "Gone quiet," "Worth capturing"),
  `priority_rank` (int), `status` (`pending|answered|skipped|superseded`), `answer` (jsonb, filled on
  response), `source_refs` (jsonb — same traceability rule as `mind_insights`: every assumed answer must
  cite what it's based on), `created_at`, `answered_at`.

**Priority and sectioning reuse existing work**, not new logic: `open_loop` and `dormant_revival` already
identify which notes need attention — build the queue from those plus Inbox age. Cap the batch per cycle
(e.g. 5-8 pending items, including at most 2-3 new-capture proposals) rather than dumping the whole backlog
— same one-thing-at-a-time rule as §1's ADHD constraints.

**Guardrailed prompt** — add this as an explicit step in the refresh loop (§6) / the `REFRESH_PROMPT` text in
`pages/mind.js`, not left implicit:

> When processing the PARA-fun queue: first read all existing `para_fun_queue` rows for this account. Leave
> still-valid pending rows untouched — do not duplicate or re-ask a question that's already waiting for an
> answer. Mark a row `superseded` if the note/data it was about has changed enough to invalidate it. Only
> after that, add new questions — including proposing a new capture if your processing surfaced something
> genuinely worth capturing.
>
> Hard rules, no exceptions: (1) never insert directly into `notes`, `tasks`, or `packets` as part of this
> step — every proposal, including a new capture, is a `para_fun_queue` row requiring the user's tap before
> anything real is created; (2) cap total new rows added this cycle (pending + new) at 5-8, at most 2-3 of
> which are `new_capture_proposal`s — do not flood the queue; (3) before proposing a new capture, check
> existing notes/tags for a near-duplicate and skip the proposal if one already covers it; (4) every
> `assumed_answer` must have non-empty `source_refs` explaining what data or reasoning it came from — an
> assumed answer with no traceable source is a bug, not a shortcut; (5) an invented `question_type` must
> still use the same row shape (`question_text`, `options`, `assumed_answer`, `section`, `priority_rank`) —
> there is no side channel for writing data outside this mechanism.

On the dashboard, answering a question calls a route that performs the real write (reusing the existing
notes/tasks/para update logic) and marks the row answered in the same request, then advances to the next
pending item in priority order.

## 4e. "Voice Flow" — third tab on `/mind`, same queue, immersive presentation

A third tab alongside Overview and "PARA, made fun" (§4d) — no new backend at all. It reads the exact same
`para_fun_queue` via the existing `GET /api/mind/queue`, and answers through the exact same
`POST /api/mind/queue/[id]/answer` — this is purely a different frontend over data that already works.

**Layout.** One item at a time, full-width focused section. Center: an animated wave visualizer with the
current question's text overlaid as a caption in the middle of it. Bottom: the same answer buttons +
custom-text-input mechanic already built for `ParaFunCard` in §4d — reuse that logic, restyle the
container.

**The visualizer — corrected spec, be precise about this, it's the centerpiece:** not a radial burst of
dots/particles. A wave visualizer that reads as something surfacing from somewhere deep, not a flat
decoration. Concretely: 3-5 translucent horizontal wave lines, layered, each undulating at a slightly
different phase and speed, opacity and blur increasing toward the back layers so the rear waves recede into
the dark background — depth via layering, not a literal 3D effect. A soft glowing point at the center is
where the waves seem to originate, pulsing gently, like light emerging from underneath rather than sitting
on top of the section. This should look genuinely captivating — smooth, luminous, unhurried motion, not
jittery or busy.

- **Idle state** (waiting for the user's tap, including during the "paused" moment after a readout finishes):
  slow, gentle breathing amplitude — still visibly alive, never fully static, since this is what's on screen
  while the user is deciding.
- **Speaking state** (see below): amplitude and speed increase — more energetic, but still smooth, never
  chaotic.
- **Color**: driven by the current item's PARA bucket via the existing `lib/paraTheme.js` accent colors
  (rose/emerald/violet/gold/mist) — same palette the rest of the app already uses, with a glow/blur filter
  for luminosity, so the whole section's color shifts as the user moves between items. `new_capture_proposal`
  questions (no existing note) default to the inbox accent.

**Voice.** Browser-native Web Speech API (`speechSynthesis`) reads `question_text` aloud when an item
becomes current — no API key, no server cost, works offline. Honest technical note: true audio-reactive
visualization (the wave literally driven by voice amplitude) isn't practically available from synthesized
speech output in browsers; drive the "speaking" amplitude state from the utterance's start/end (and
`onboundary` if useful for finer timing) rather than claiming real waveform analysis.

**Pause where input.** Buttons and the text field stay de-emphasized until the readout finishes; once it
ends, the visualizer drops to its idle-but-alive state and the answer controls become the focus. Include a
mute/skip control — forcing a full readout on every item would get tedious once the user is moving quickly
through the queue.

**Reuse, don't reimplement.** Same `item` shape as `ParaFunCard`, same `onAnswer` handler, same
assumed-answer-highlighted-as-default and custom-text-fallback behavior from §4d — only the container,
visualizer, and voice layer are new.

## 4f. "Visit Your Brain" — the real shape of this, superseding a flat third tab

Correction from the user, and it changes the frame: this isn't a tab with a wave animation on it. It's meant
to feel like a *visit* — walking into a visualized, Matrix-styled space that represents "your brain, as of
its last update," made of a particle/data field (the green-and-gold dot-field, deep-perspective aesthetic
from the reference images), with distinct sections the user selects to enter, rather than one linear queue.
Surreal, futuristic, a destination — not a dashboard. §4e's wave visualizer isn't wasted work — it's now the
component used *inside* a section once you're in it, not the whole experience.

**Structure:**

1. **Entry.** A full-bleed particle field, dark background, green/gold data-motes per the reference images,
   framed as "your brain, last updated [timestamp of the most recent mind_insights/para_fun_queue row]."
   This is the front door — it should read as arriving somewhere, not loading a page.
2. **Sections — CORRECTED: dynamic, cycle-written, not the app's taxonomy.** The user rejected the
   first version of this list (nodes mirroring insight kinds and queue types — i.e. the app's own tabs
   restated as nodes). The brain field is not a navigation layer over the schema; its nodes are
   **sections the refresh cycle itself writes, grounded in the user's real data, different every cycle**.
   The cycle decides which sections exist, their titles, order, and content. Examples of what a cycle
   might emit (illustrative, not a fixed list):
   - **Overview** — the narrative of the period (existing `overview` kind)
   - **Recent activity** — real `activity_log` events, humanized ("you captured 4 notes about X on Friday")
   - **What you might do next** — the researched `recommendation` rows
   - **Interest feeds** — if the data shows an interest (say, football), a researched digest of current
     football news/links written during the cycle, per 02_resource_research_method.md
   - **Questions / permissions** — asks like "want me to research X deeper next cycle?"; answering writes
     the grant back (via the existing queue-answer mechanic) and the next cycle acts on it
   - **Reminders** — surfaced from open loops / dormant items when timing warrants
   Mechanism: a new `mind_sections` registry table (`id, user_id, slug, title, accent, renderer, position,
   metadata, created_at, superseded_by/at`) written each cycle like any other kind (supersede prior set,
   never delete). `renderer` names one of a small set of client renderers (`insight_list`, `queue`,
   `activity_digest`, `feed`, `question`, `reminder`); `metadata` carries what that renderer needs (insight
   kind, queue filter, feed items with URLs). The app renders whatever the current set is — if the table is
   empty (no cycle run yet), fall back to a minimal static set so the page never breaks. Role separation
   (03_refinement_loop.md) applies across sections: one job each, no restating.
   Selecting a section transitions into it (a convergence/push-in motion reads well here) and surfaces that
   section's content — read-only sections get a calm presentation (visualizer + voice readout, no answer
   needed); actionable ones (queue/question renderers) use the exact §4d/§4e mechanic (wave visualizer,
   voice readout, buttons + custom text, PARA-accent color).
3. **Written command, clarified.** This reuses the custom-text-input path already built in §4d/§4e (type
   instead of tapping a button) — plus simple universal commands recognized within any section: "next,"
   "skip," "back to brain" and similar. This is not open-ended AI chat inside the app — there's still no
   `ANTHROPIC_API_KEY` and no live model call in the app's own code (§4a's rule holds). If free-form
   conversational input ever becomes the goal, that's a materially bigger decision (an API key, or routing
   through Claude Code some other way) and should be raised explicitly, not assumed here.

**Voice bug — fix before building further.** "I hear no sound" is almost certainly one of two well-known
`speechSynthesis` gotchas, not a deeper problem: (1) most browsers silently block speech synthesis unless
the very first `speak()` call happens synchronously inside a real user click/tap handler — triggering it
from a `useEffect` on mount will produce nothing. The entry into "Visit Your Brain" (a deliberate "begin"
tap) is actually a good natural place to satisfy this. (2) `speechSynthesis.getVoices()` can return an empty
list on first call in some browsers — wait for `speechSynthesis.onvoiceschanged` before relying on a voice,
or don't specify one and let the browser default. Also guard all of this behind
`typeof window !== 'undefined'` since Next.js renders server-side first.

**Rendering technology — flag this as a real decision, not a detail.** A field this dense and layered is
Canvas or WebGL territory, not DOM/CSS. Recommend starting with 2D Canvas (lighter, no new heavy dependency,
and the reference images are themselves essentially 2D/2.5D particle fields — this gets close without the
complexity jump) rather than reaching for three.js/WebGL immediately. Revisit WebGL later only if 2D Canvas
genuinely can't deliver the depth/motion wanted.

**Keep an escape hatch.** Per §1's existing ADHD-accommodation rule, don't make the immersive experience the
*only* way to check something quick — keep the flat Overview/PARA-fun list view (§4d) available as a plain
fallback (a small "list view" toggle), so a 10-second check doesn't require a full flythrough every time.
The surreal version is for when the user wants it, not a mandatory gate in front of the data.

## 5. Push notifications — DEFERRED for now

Not being built yet. This was originally a real Web Push system (service worker + VAPID keys +
`push_subscriptions` table) delivering hourly check-ins and nudges — parked in favor of the simpler manual
loop in §6. The `push_subscriptions` table can stay in the schema unused; revisit this section if/when
always-on notifications are wanted. Until then, staleness reminders (§6) live on the dashboard itself, not
as push notifications.

## 6. Daily loop (orchestration) — revised: manual, Claude-Code-driven, no API key

Simplified per the user's actual preferred flow — no automated cron, no serverless function, no LLM API key
anywhere in the app:

1. The app continuously accumulates data into `activity_log` as the user uses the app (no manual step —
   already wired up). `device_activity` stays unused per §3.
2. The user asks Claude Code to read all the data for their account — notes, tasks, packets, activity_log,
   current `mind_insights` — via its Supabase MCP connection.
3. Claude Code processes it: it can re-run the existing deterministic job (`POST /api/mind/synthesize`,
   already built, no LLM needed) for the four template-based kinds, and/or write the `overview` (§4a),
   `inferred_goal`, `user_model`, and `recommendation` (§4b) insights directly itself, using its own
   reasoning (plus real web research for recommendations), via a direct `INSERT`/`UPDATE` through its
   Supabase MCP write access.
4. Claude Code pushes whatever it produced straight into Postgres — same DB the app reads from, so nothing
   further is needed for the app to pick it up.
5. The app's role is just to notice staleness and ask: the dashboard (§8) shows how long it's been since
   `mind_insights` was last updated, and when that's more than a day or two old, prompts the user with
   something like "Your Mind Model is N days old — ask Claude Code to refresh it" alongside the exact prompt
   text to paste into Claude Code. No push infrastructure needed for this — it's a banner on a page the user
   already opens.

## 7. Goal-alignment reminders

Comparison of current activity against the `inferred_goal` insights from §4 (also written by Claude Code
directly, same as §4a — no API key, no automated job). Delivered via the same dashboard staleness banner as
§6, not a separate push mechanism (§5 is deferred). Always paired with the source notes the goal was
inferred from, so it reads as "this looks related/unrelated to what you said you're working toward in
[note]," not an unexplained judgment call.

## 8. Mind Model dashboard page

New page (e.g. `/mind`) showing current `mind_insights`, grouped by kind, each with its source references
visible/expandable. This is the human-readable surface of everything above — keep it a mirror (§1), not a
scorecard or a to-do list dressed up as insight.

Layout: the `overview` insight (§4a) renders first, as a plain paragraph near the top of the page — this is
"the whole overview," the thing the user most wants to see. Below it, the other four kinds render as
individual cards/rows grouped by kind, each expandable to show the notes/stats it's traceable to. Include a
"Run now" button that calls `POST /api/mind/synthesize` and refreshes the page — this is the manual trigger
already built (§6 step 5), just needs a UI control for it.

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
  (`device_activity`, `activity_log`, `mind_insights`, `push_subscriptions`, `mind_knowledge`) — never
  existing ones.
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
8. Personality model & research layer (§4b): migration `006_mind_personality.sql` extending the `kind`
   constraint with `user_model` and `recommendation`, then dashboard groups for both. The insights
   themselves need no app code — Claude Code writes them in the manual loop (§6), starting conservative
   while data volume is low.
9. Knowledge store (§4c): migration `007_mind_knowledge.sql` creating `mind_knowledge`, then seed it
   from the repo's `mind_knowledge/*.md` docs (one `scope='general'` row per file). From then on, every
   refresh cycle starts by reading this table and ends by writing user-scope calibrations back to it.

## 10. If something's unclear

Ask rather than assume — especially anywhere this brief says "traceable," "mirror not oracle," or
"inferred, not asserted." Those constraints exist because this system handles genuinely personal data and
is meant to reduce the user's cognitive load, not add a new source of quiet, unverifiable judgments about
them.
