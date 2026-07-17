# Onboarding import method — processing what a new user pasted in

First-time onboarding (`/mind`, `components/Onboarding.js`) collects a name, age, a
self-described persona, and up to 5 pasted blocks of pre-existing material — old AI chat
transcripts, documents, kanban boards, journals, calendar exports — stored raw in
`onboarding_imports` (`source_type`, `raw_text`, `processed`). Nothing is auto-turned into
notes/tasks at onboarding time; the hard invariant from `04_adhd_support_map.md`'s cousin,
§4d's queue rule, applies here too: **pasted material is a lead the next cycle investigates,
never a direct write.** This doc is that investigation's method.

## Every cycle, check for unprocessed imports first

Before the normal refresh steps: `SELECT * FROM onboarding_imports WHERE user_id = $1 AND
processed = false`. If none exist, skip this whole doc for the cycle — most cycles will have
none, this only fires once (or a few times, if imports arrive across sessions) per account.

## Read each unprocessed import as a lead, not a transcript to summarize

The point is not to produce "here's what your old chat said" — that's restating, not
investigating (same discipline as `field_investigation_method.md`'s filter step). Instead,
mine each import for real signal that changes how later cycles read this account:

- **Recurring topics/interests** — feed into `inferred_goal` and `mind_topics` the same way a
  cluster of notes would (§4, `topic_map_method.md`): a topic that shows up repeatedly across
  an imported chat or journal is real evidence, a single passing mention is not — same
  recurrence bar as everything else.
- **Working style signals** — self-regulation patterns, what the person says they struggle
  with or gravitate to, stated goals or ongoing projects. This is `user_model` material
  (`00_meta_map.md`'s tiers), sourced from the import instead of from in-app activity — cite
  it with `source_refs: [{"type":"stat","name":"onboarding_import","value":"<source_type>"}]`
  since there's no note/task id to point at.
- **Concrete open threads worth surfacing** — an unfinished project, a recurring worry, a
  half-formed idea — these can seed `para_fun_queue` `new_capture_proposal` rows exactly like
  any other cycle's proposals (§4d), still capped and still requiring the user's tap before
  anything real gets created. An import is not an exemption from the airlock.
- **The persona field is a stated self-description, not a verified fact** — weight it the way
  `resource_research_method.md` weights a note's literal content: read what it reveals, don't
  treat "Tech-savvy" as license to assume technical depth the actual imported material doesn't
  show.

## Filter hard — imported material is noisier than a user's own notes

A pasted AI chat transcript contains the assistant's own words, throwaway tangents, and dead
ends alongside real signal. Apply the same bar as `field_investigation_method.md`'s filter
step: only write something if a knowledgeable reader of the *whole* import would call it a
real, recurring pattern — not every topic the transcript happens to touch. When genuinely
unsure whether something is signal or noise, leave it out; overreach here is a bug, not
a shortcut, same as everywhere else in this system.

## Mark it processed — exactly once

After incorporating whatever real signal an import had (even if that's "nothing rose to the
bar"), `UPDATE onboarding_imports SET processed = true, processed_at = now() WHERE id = $1`.
Never reprocess an already-processed import on a later cycle; never leave one unprocessed
past the first cycle that saw it. If an import is empty or unusable, mark it processed anyway
with a one-line note in `cycle_notes` — a stuck unprocessed row is worse than a skipped one.

## Changelog

- 2026-07-17: initial version, alongside onboarding's first build.
