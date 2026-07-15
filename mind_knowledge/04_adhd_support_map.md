# ADHD support map: evidence for the four `user_model` sections

This is the built-in map for the sectioned `user_model` insights (§4g of MIND_MODEL_BRIEF.md). It defines
what counts as *real evidence* for each of the four sections so "patterns" never degrades into vague
pop-psychology guessing. Read it alongside `00_meta_map.md` — that doc says *what to figure out and at what
data tier*; this doc says *how to ground each section in observable data*, for the ADHD-specific niche.

**Product niche, now explicit.** This is a second brain built for ADHD users specifically, not a generic
PKM tool. Let that shape language and priority everywhere: low activation energy, one-thing-at-a-time,
externalized memory, non-shaming framing (§1). It does NOT license clinical framing — see the hard line
below. "ADHD-accommodating" is a design posture, not a diagnosis the system makes or assumes.

Every `user_model` row still obeys the base rules: `source_refs` required, framed as "based on these N
notes/events, it looks like…", mirror-not-oracle (§1), and depth chosen by data volume (`00_meta_map.md`).
Overreach on thin data is a bug in every section here too.

## `section = 'patterns'` — recurring themes (safe version of "core themes")

What reliably recurs in *what the user works on and how they work*, stated as observation, not character.

- **Real evidence:** topic/tag clusters that recur across weeks; PARA buckets the user actually lives in
  vs. avoids; capture-time-of-day regularities; note types that recur (questions vs. resources vs. logs).
- **Not evidence:** a single note; a one-off tag; inferring a personality trait from a theme ("you're a
  visual thinker"). Match format to content, never to a supposed learning style (`00_meta_map.md`).
- **Phrasing:** "Across ~N notes over the last M weeks, X keeps recurring" — a count and a window, not a label.

## `section = 'triggers'` — what reliably precedes overwhelm or task-avoidance (behavioral, never clinical)

A practical read of *conditions that, in the logged data, precede stalling* — so it can be worked around.

- **Real evidence:** notes/tasks that consistently stall at a particular stage (e.g. captured but never
  distilled); buckets where context-switching spikes right before abandonment; a repeated gap between
  capture and any follow-up on a specific kind of item; task backlogs that grow before completions drop.
- **Not evidence:** emotional/clinical causation ("you avoid this because of anxiety"), or anything about
  *why* internally. Stay at the level of "when X situation shows up in the data, follow-through drops."
- **Phrasing:** "Items of type/bucket X tend to stall at stage Y" — a describable, workaroundable condition.

## `section = 'progress'` — is follow-through improving over time (safe version of "baseline comparison")

Whether the observable follow-through metrics are trending, compared against the user's *own* earlier data.

- **Real evidence:** capture→distill ratio this period vs. prior; median time-to-complete on tasks now vs.
  earlier; open-loop count trend; dormant-item revival rate. Always the user's own trajectory, never a norm.
- **Not evidence:** comparison to other people or to an ideal; a verdict of "good/bad." Report the direction
  and the numbers behind it.
- **Phrasing:** "Distill rate went from A to B across these two windows" — trend + the counts it rests on.
  Requires enough history to have two windows; on thin data, say "not enough history yet to compare."

## `section = 'cycles'` — thought → stall → avoidance loops

Named, repeating sequences the data shows — the loop, described so the user can recognize and interrupt it.

- **Real evidence:** a repeating sequence visible across multiple instances — e.g. burst of captures on a
  topic → no distillation → the cluster goes dormant → later revival attempt → same stall. Needs several
  instances of the *same* shape to count as a cycle, not one occurrence.
- **Not evidence:** a single stall (that's a one-off, maybe a `triggers` observation); a psychodynamic loop
  ("you self-sabotage"). Describe the observable steps and cite each instance in `source_refs`.
- **Phrasing:** "This sequence has repeated N times: capture-burst → no distill → dormant → …" — steps + instances.

## Hard line — explicitly NOT modeled (not a v1-vs-later scope call)

These are clinical assessment functions requiring licensed judgment and a consent/oversight structure this
app does not have. An automated, unverified pipeline attempting them is a real harm risk in *both*
directions — a false negative on real risk, and a false positive causing needless alarm. Do not produce
them in any section, under any framing, at any data tier:

- **Diagnosis** — DSM-5 or otherwise, including "you have/show ADHD/anxiety/depression."
- **Defense mechanisms / transference** — psychodynamic interpretation of the user's inner state.
- **Safety / risk-of-self-harm tracking** — no risk scores, no self-harm inference, ever.

The only acceptable wellbeing signal is narrow and non-diagnostic: noticing a *sharp drop in activity* and
gently asking if the user is okay — never a risk score, never a diagnostic claim. If in doubt, leave it out
and stay in the behavioral, data-cited register the four sections above define.

Sources: Dunlosky et al. 2013 (technique rankings), self-regulated learning research (see
`00_meta_map.md`); learning-styles-myth prohibition per `00_meta_map.md`.
