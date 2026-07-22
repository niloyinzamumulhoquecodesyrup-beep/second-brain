# Second Brain: feature documentation

This documents what is actually built and reachable in the app today, based on the code in the repo (Next.js pages router + Postgres/Supabase). It does not cover items marked deferred or removed in the planning docs (MIND_MODEL_BRIEF.md, REMINDERS_PLAN.md) unless the code backing them genuinely exists. Where something exists in code but isn't wired into any page, that's called out explicitly.

## What the app is

A private, single-user "second brain" built around the CODE method (Capture, Organize, Distill, Express) and the PARA system (Projects, Areas, Resources, Archives), extended into an ADHD-support layer (tasks, routines, focus timer, reward system) and a self-updating "Mind Model" that a Claude Code session (connected via Supabase MCP) writes into the same database. Single account, password-gated on every page and API route.

## Account and security

Email/password login, bcrypt-hashed, signed JWT in an httpOnly cookie. Every page uses `getServerSideProps` (`requireSessionSSR`) to redirect to `/login` without a valid session; every API route runs the same check server-side (`requireAuth`). A `/register` route exists and creates a new user row, but the app is designed and documented as single-tenant. The login endpoint rate-limits repeated failed attempts per IP (10 per 15 minutes). Pages set `noindex, nofollow` and the app sends baseline security headers via `next.config.js`. To change the password, update `SEED_PASSWORD` in `.env.local` and re-run `npm run seed:user`.

## Navigation

Four top-level tabs in the header (`components/Layout.js`): Work, Organize, Mind, and MINDVERSE. A theme toggle (dark/light, sun/moon glyph) and sign-out sit alongside them. Mobile gets a horizontally scrollable version of the same nav.

## First-run experience

**Onboarding** (`components/Onboarding.js`, gated by `GET /api/onboarding/status`, saved via `POST /api/onboarding/complete`): a one-screen-at-a-time wizard over a pulsing cyan eclipse-ring backdrop (`EclipseAnimation.js`). Asks for a name, an optional age, and a persona (tech-savvy, creative, student, business, researcher, "just getting organized," a focus/follow-through option, or a custom "other"). Then offers up to 5 paste slots for existing material (AI chat transcript, document, kanban board, journal, calendar export); anything pasted over ~400 characters collapses into a "pasted, N characters" chip so the page doesn't choke on a huge paste. Finishing writes `display_name`/`age`/`persona`/`onboarded_at` to the user row and inserts one `onboarding_imports` row per non-empty paste. None of the pasted material is processed at submit time; it's picked up as unprocessed input the next time a Claude Code refresh cycle runs (see Mind Model section). Existing accounts were grandfathered past this gate when it shipped, so nobody already using the app gets dropped into onboarding retroactively.

**Guided tour** (`components/TourProvider.js` + `TourOverlay.js`, status via `GET /api/tour/status` / `POST /api/tour/complete`): runs once, right after onboarding, before the account's own (still empty) Mind Model is shown. Steps: welcome (on Mind) &rarr; work &rarr; capture &rarr; organize &rarr; distill &rarr; express &rarr; summary (back on Mind). Every step is a full-screen simulated overlay with mock data typing itself in (`TypingField`) or a mock Work-page demo (task check-off, a one-line focus ring, mock reward gauges); nothing simulated ever writes a real note, task, or routine. A navigation lock forces the tour's expected page for whichever step is active (typing a URL or clicking a nav link mid-tour bounces back), and progress is kept in `localStorage` so a reload resumes rather than restarting.

## Work page (`/work`)

The "doing" surface: what's on today, a reward panel, and the routine planner.

**Reward panel** (`components/RewardPanel.js`): four dimensions, each a glass-tube "tank" gauge for today's count (Streak, Captures, Tasks done, Focus sessions) plus a lifetime level number and a progress bar toward the next level. Levels only ever go up (pure function of lifetime totals from `GET /api/stats`); daily gauge targets adapt to the median of the last 7 days for that dimension rather than a fixed number, so the tank stays reachable. A streak counts consecutive active days ending today-or-yesterday (never reads as "broken" just because today hasn't happened yet). Nine badges unlock at capture/task/focus/streak milestones. A rotating quote line (ADHD-aimed, about starting rather than effort) can be cycled with a "new quote" button. Completing a task or logging a focus session on this page bumps the gauges immediately client-side (no reload) and has a small chance (or a guaranteed chance on a fresh level-up) of firing a bigger "surprise bonus" celebration with its own message. None of the reward state is persisted server-side beyond the underlying stats; levels/badges/streak are recomputed from real data every time.

**Today cards** (`components/TodayCards.js`): today's tasks plus today's routine occurrences, rendered as colorful, icon-tagged cards (title, time, a Start button, a done toggle) that can be dragged to reorder, which opens a small time popup to retime the moved card, either by typing a time or by an "auto balance" button that spaces every card back-to-back in the new order. Marking a card done (not un-marking) fires the checkmark celebration; the card stays in the list, ticked, instead of disappearing.

**Focus / Pomodoro** (`components/FocusPomodoro.js`): tapping Start on a Today card slides into a dedicated focus view: a colored ring timer (25 min focus / 5 min short break / 15 min long break presets), the task's title shortened to a couple of words by a small on-device model (`lib/titleShorten.js`, falls back to a naive word-clamp if the model can't load), and a "break it into pieces" checklist for splitting the task into smaller steps (persisted on the task's `pieces` column, or held in memory for a routine instance). Finishing logs a `focus_session` activity event (with real elapsed minutes, only if at least a minute of actual focus time elapsed) and marks the task/routine done.

**Task list** (`components/TasksPanel.js`): quick-add (title + optional due date), a "this week" and "this month" grouping beneath Today, a collapsible list of tasks spun off from distilled notes, and a "your brain suggests" strip that surfaces any pending Mind-cycle suggestion whose accept action is `create_task` (accept writes the real task and marks the underlying suggestion row answered; dismiss marks it skipped).

**Routine planner** (`components/RoutinePlanner.js`): a recurring-schedule editor: click-to-add starter routines (sleep, morning routine, breakfast, deep work block, lunch, evening reading), a free-text box ("what do you do on a regular basis?") that gets saved for the next Mind cycle to turn into structured suggestions, and full CRUD on routines (title, category, per-weekday toggle, time, duration, pause/resume, delete). Routines created by a refresh cycle are tagged "from your brain."

Note: a fuller day/week planner view exists in the codebase (`components/ProductivityTab.js`, a drag-to-resize gantt-style day view, a week grid, time-of-day pie charts, a live sun/moon "sky clock" with optional geolocation-based sunrise/sunset and weather from open-meteo.com, and cycle-suggested one-off schedule blocks) backed by real API routes (`/api/planner`, `/api/planner/routines`, `/api/planner/prompts`), but it is not currently mounted on any page (no import from `pages/work.js` or elsewhere), so it isn't reachable through the app's navigation right now. Its underlying routine data does power the Routine Planner and Today Cards described above.

## Organize page (`/`)

**Capture**: a "+ Capture" button opens a popup form (title, freeform content with `[[Note Title]]` cross-reference syntax, a PARA bucket picker defaulting to Inbox, optional source URL, comma-separated tags). `[[links]]` typed in the content are parsed on save into a `note_links` table (`lib/links.js`), powering backlinks. The popup stays open after a save so a burst of captures doesn't require reopening it.

**PARA Cube** (`components/PARACube.js`): a swipeable, 3D-tilted cube with one face per bucket (Projects, Areas, Resources, Archives; Inbox is handled elsewhere). Each face shows that bucket's notes as icon tiles (a fixed emoji assigned deterministically per note id); swiping or using the arrow buttons rotates to the next face. Clicking a note opens an action sheet (`components/NoteActionModal.js`) to: write/edit an executive summary and mark the note distilled, move it to another PARA bucket, or, once distilled, spin it into one or more tasks and/or save it as a reusable "packet." An optional `?tag=` filter (from clicking a tag elsewhere) scopes the cube to notes with that tag.

**Mind map** (`components/MindMap.js`): an Obsidian-style force-directed graph of every note, canvas-rendered, pan/zoom/pinch, colored by PARA bucket. Edges are either real (`[[links]]` the user typed) or AI-inferred (dashed, toggleable on/off) from embedding cosine similarity between notes that aren't already linked. Clicking a node opens a small panel with the note's title/tags and a link to the full note.

**Inferred goals chart** (`components/InsightCards.js`, `GoalArrowChart`): a numbered ribbon-and-target infographic of the account's `inferred_goal` insights (see Mind Model section below for how those get written), split left/right, each goal shown only as a short title until clicked, which opens the full summary and source notes underneath.

**Field Investigation Report** (same file, `RecommendationCardBody`): a one-at-a-time, paged set of the account's `recommendation` insights. Each can render as plain text, a learning-path diagram (dependency-ordered nodes with per-node resources and practice suggestions), a concept card (term, field/branch, a short philosopher/originator timeline), or a small bar chart, but only ever with a cited source for any numeric claim.

## Note detail page (`/notes/[id]`)

Full view/edit of a single note: title, content, PARA badge, distilled/pinned badges, tags (clickable, filters Organize by tag), source URL, executive summary. Edit mode swaps in a form for title/content/PARA/tags/source. Pin/unpin and delete (with a confirm prompt) are available. Three relationship panels: "Links to" and "Linked from" (explicit `[[wiki-links]]`, directional), and "Related notes" (embedding cosine similarity, deliberately excluding anything that already shares a tag or an explicit link, so it surfaces connections the other two panels can't).

## Mind page (`/mind`)

Gated by the same onboarding check as above; while onboarding isn't complete, this page renders only the onboarding wizard, nothing else.

Two tabs: **Overview** and **Knowledge library**.

### Overview tab

- **News strip ("Latest in your world")**: a scrolling, pausable ticker of cycle-researched links relevant to the account's real interests, color-coded by rough topic domain (science/technology/business/humanities), capped at 6 items. Empty until a cycle has actually written one.
- **Staleness banner**: once real Mind Model data exists and is more than 2 days old, shows a banner with a ready-to-copy prompt (account email pre-filled) to paste into a Claude Code session with the Supabase MCP connected, which re-runs the refresh cycle (see below). Before anything has ever been generated, a calmer "your second brain is processing the information" notice shows instead.
- **Cycle health card**: last refresh's status (ok/partial/error), how long ago, and counts of insights/sections written and estimated tokens spent, with an expandable notes field for anything that failed. Comes from `mind_cycle_runs`, written by Claude Code at the end of each cycle.
- **The whole picture**: a donut chart of note counts per PARA bucket, with an expandable link to the cycle-written narrative overview underneath.
- **Reminders**: things captured but never distilled or turned into a task/packet (the `open_loop` insight kind), shown as plain nudges with a one-tap "+ add to my day" that creates a real task due today.
- **Attention patterns**: a line chart of notes captured per day over the last 21 days, peak day marked, with the template-generated attention-pattern text as a caption.
- **Knowledge Galaxy** (`components/KnowledgeGalaxy.js`): a force-directed, canvas-rendered "galaxy" of a real academic/interest taxonomy (Science, Technology, Business, Humanities and their subfields), written by refresh cycles into a `mind_topics` table. Nodes the account has real evidence for (an inferred goal, or a Knowledge Library entry) glow and scale by amount of evidence; everything else sits dim, so the map reads as "here's where your real interests sit within the whole space," not just a list of tags. An optional heat-gradient overlay and pan/zoom/pinch are built in.
- Automatic 2-minute auto-refresh while the page is open: re-embeds any new/edited notes client-side (on-device model, `lib/clientEmbeddings.js` + a Web Worker), then calls the deterministic synthesis endpoint (below). This replaced an earlier manual "Run now" button.

### Knowledge library tab

The durable, never-cleared archive of everything a field investigation cycle has ever learned for the account, not just what made a given cycle's report. A "recently reinforced" shelf up top, then a searchable/filterable grid (by domain and entry type: concept, roadmap, fact, method), each entry showing a star rating for how many cycles have reinforced it. Opening an entry shows its full rendered content (the same roadmap/concept/chart components as the Field Investigation Report), any freeform detail notes, and its sources. Entries the field investigation looked into but filtered out of a given cycle's report (background research) are marked as such rather than hidden.

## The Mind Model: what's automatic vs. what needs a Claude Code session

This is the app's most distinctive feature, and it has two very different halves.

**Automatic, deterministic, no AI/API key** (`lib/mindSynthesis.js`, triggered by `POST /api/mind/synthesize`, which the Mind page calls on its own every 2 minutes): computes four insight kinds purely from SQL over the account's real data.
- **Interest clusters**: notes grouped by shared tag, plus (separately) notes grouped by embedding similarity despite sharing no tag, each labeled growing/steady/fading by recent activity.
- **Open loops**: Project/Area notes never distilled and never turned into a task or packet.
- **Dormant revival**: Project/Area notes with no activity in 21+ days.
- **Attention patterns**: percentage of sorted notes that were ever distilled or acted on, and median time from creating a task to completing it.

**Manual, Claude-Code-driven, still no API key in the app itself**: everything else in the Mind Model (the plain-language overview narrative, `inferred_goal` rows, `user_model` "how you seem to work" observations, the Field Investigation Report / Knowledge Library entries, the news-strip feed, the Knowledge Galaxy's topic tree growth, planner suggestions, and the `mind_cycle_runs` health record) is written by a human asking a Claude Code session, connected to the same Supabase database via MCP, to read the account's data and insert rows directly. The app deliberately embeds no `ANTHROPIC_API_KEY` and makes no live model call anywhere in its own server code; the copyable refresh prompt on the Mind page's staleness banner is the actual instruction set for that session, including an explicit account-scoping rule, a "mirror, not oracle" rule (describe patterns, never tell the user what to prioritize), and a no-em-dash style rule. Every insight of every kind carries `source_refs` back to the specific notes/activity it was drawn from.

**Task/routine suggestion queue**: a `para_fun_queue` table backs "your brain suggests" chips on the Work page's task list and cycle-written planner prompts/suggested schedule blocks on the (currently unmounted) planner view. Nothing is ever written to notes/tasks/packets/routines from a suggestion until the user taps accept; a cycle can propose but never silently commit. An earlier standalone "PARA made fun" swipe-through tab for working through this queue, and a separate immersive "Visit Your Brain" particle-field experience, were both built and then explicitly removed per product direction; the queue itself lives on through the Work-page suggestion chips and planner prompts instead.

## MINDVERSE (`/other-brains`)

Cross-account (all users, not just this one), fully separate from the rest of the app's single-user data model. Two tabs.

**Other Brains**: a community interest map (same force-directed galaxy visual as the personal Knowledge Galaxy, fixed taxonomy of Science/Technology/Politics/Arts/Commerce/Humanities, lit up by real aggregate study activity across all accounts); an anonymous identity gate (pick a display name once, get a random avatar, no rename, never tied to your email); then, once joined, three live widgets: a chat panel, a suggestion box, and a "what book are you studying now" board, all updating in real time via Supabase Realtime.

**Mindcord**: topic-based chat rooms that materialize lazily (joining a domain creates its room if none exists), capped at 6 live participants per room, showing a live list of who's present. Chat only for now; a note in the room explicitly says voice/video are "coming soon" (the schema anticipates it, but no WebRTC signaling is implemented yet).

## Theming and UI details

Dark/light theme toggle (`ThemeProvider`/`ThemeToggle`), persisted to `localStorage` and applied before first paint (no flash of the wrong theme). A PARA accent-color system (`lib/paraTheme.js`) is shared across the cube, mind map, badges, and note action modal. Canvas-based visualizations (Mind Map, Knowledge Galaxy, Community Map) respect `prefers-reduced-motion` and an app-level "calm mode" flag.

## Notable gaps versus the project's planning docs

For accuracy: a few features described in the repo's own planning documents are not live. There is no reminders/notifications system yet (no due-date nudges, no bell, no Web Push) despite a detailed build plan for one (`REMINDERS_PLAN.md`); the closest thing today is the passive "Reminders" card on the Mind Overview tab. There is no browser extension or any device/browser activity tracking (`device_activity` stays empty by design). The multi-dimensional reward system described as a build spec (`REWARD_SYSTEM_PROMPT.md`) is implemented and live on the Work page. The full day/week planner UI (`ProductivityTab.js`) exists and is functional against real API routes but isn't linked from any page's navigation right now.
