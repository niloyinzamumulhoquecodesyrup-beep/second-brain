# Field investigation method — the brain's own learning, not summarization

This governs the `recommendation` kind's new frame, **Field Investigation Report** (formerly labeled
"What you might do" on the dashboard — same `mind_insights.kind = 'recommendation'` rows, same
role-separation rule in `03_refinement_loop.md`, reframed). The old frame answered "what should the user
do with what they captured." This one goes further: **the brain runs its own investigation each cycle,
learns things the user never wrote down, filters what's worth keeping, and remembers it permanently.**
Read this alongside `01_learning_path_method.md` (roadmap/path structure) and `02_resource_research_method.md`
(when a link vs. terms vs. a diagram is the right shape) — this doc adds the investigation step that
precedes both, the concept/definition shape neither covers, and the durable-memory step that follows.

## The three-step loop, every cycle

1. **Investigate** — treat every note, tag, and inferred goal as a *lead*, not the finished content. Ask:
   what does a well-informed person know about this that the user's own notes don't say? For a stated
   interest in a field (neurobiology, ontology, Satoshi's protocol design), that means going and learning
   the surrounding structure — definitions, the field/branch something belongs to, the people who
   originated or shaped it, how it connects to adjacent concepts — the same real-research posture
   `02_resource_research_method.md` already requires for course-finding, applied to concept-learning too.
2. **Filter — for the report, not for the library.** Only genuinely new, worth-knowing findings (not
   textbook trivia, not something already covered by an existing note) go into this cycle's Field
   Investigation Report. But the filter no longer decides what gets remembered at all — see Persist below.
   This is the same discipline `03_refinement_loop.md` applies to `user_model`: overreach on thin
   justification is a bug, not a shortcut, but a filtered-out lead is still real research and still gets
   kept, just not surfaced.
3. **Persist — everything investigated, not just what's shown.** `mind_knowledge_library` is the durable
   record of everything the brain's field investigation has learned, including the material that didn't
   clear the report's bar — not only the polished subset the user sees. Every finding this cycle
   investigated, filtered or not, gets upserted into `mind_knowledge_library` by `(user_id, domain,
   title)`: if the row already exists, update `summary`/`metadata` only if this cycle's version is a
   genuine improvement, bump `cycle_count` by 1, and set `last_reinforced_at = now()`; leave
   `first_learned_at` untouched. Never delete or truncate this table — it is meant to only grow. Set its
   `surfaced` column to `true` only for findings that also get written to `mind_insights`
   (`kind='recommendation'`, this cycle's report, superseded wholesale each cycle like every other kind —
   existing behavior, unchanged); set `surfaced = false` for filtered-out background research that the
   library alone remembers. `mind_knowledge_library` is what powers the "Knowledge Library" dashboard
   section: the accumulated map of everything the brain has learned across every cycle — reported and
   unreported alike — not just the current cycle's report.

## Picking the domain for a library entry

Use the matching hub name from the account's `mind_topics` tree (`mind_knowledge` topic
`topic_map_method`) as `domain` where one exists — e.g. a philosophy term's `domain` is `"Philosophy"`,
a neuroscience one is `"Neuroscience"` — so the library groups the same way the knowledge galaxy already
does. Only invent a new domain string when nothing in the tree fits, and prefer growing the tree (per
`topic_map_method`'s existing rules) over inventing a one-off label that will never match anything again.

## Choosing the shape — extends `02_resource_research_method.md`'s decision, adds one more branch

That doc already covers: a handful of terms with one-liners, a roadmap diagram (`metadata.path`), a
cited chart (`metadata.chart`), or plain text as the last resort. Add a fourth shape for anything that is
fundamentally a *concept* rather than a sequence or a comparison — most notably philosophical/theoretical
terms like ontology, epistemology, qualia, determinism, but the shape applies to any field's foundational
terms, not philosophy specifically:

- **`metadata.concept`** — `{ term, definition, branch, philosophers: [{ name, era, contribution }],
  related_concepts: [string] }`. `definition` is one or two plain sentences — this is common-knowledge
  definitional content, not a research claim, so it doesn't need a citation the way a course
  recommendation does (same posture `02_resource_research_method.md` already takes for terms/one-liners).
  `branch` names the specific sub-field the term belongs to (e.g. `"Epistemology"` for "justified true
  belief," `"Philosophy of Mind"` for "qualia") — this can equal `term` itself when the term *is* a
  branch (e.g. term "Epistemology," branch "Epistemology"). `philosophers` is capped at 2-4 — the person
  or people most responsible for originating or defining the concept, not an exhaustive history; each
  entry is a name, a rough era, and one clause on their actual contribution to *this* concept, not their
  whole career. `related_concepts` is optional and short (2-3 max) — adjacent terms worth knowing next,
  not a reading list.

Non-philosophy fields get the same shape when they have a real conceptual core worth defining this way
(e.g. a biology term, a CS term) — `branch` just names whatever the field's own internal division is.

## Visual-first — no prose that restates a diagram

Every shape above (`path`, `chart`, `concept`) is a rendered visual on the dashboard, not a caption for
one. The `summary` field on the `mind_insights` row is a plain title-level line — a few words, not a
paragraph — never a restatement of what the diagram already shows. Concretely:

- Wrong: `summary = "A roadmap into neurobiology, built the way any intro course sequences it — one
  neuron, then how it fires, then how neurons talk to each other, then the brain's major regions —
  ending on your own standing questions about the mind rather than a certificate chase."` (the diagram
  already shows the sequence; this sentence adds nothing a glance at the nodes doesn't.)
- Right: `summary = "Neurobiology, sequenced."` — the `path` diagram carries the actual content.
- Wrong (concept case): a paragraph explaining what epistemology is before showing the concept card.
- Right: `summary = "Epistemology"` (or omit `summary` narration entirely and let the card's own
  `definition` field be the only prose) — the card shows definition, branch, and philosophers; no prose
  restates it above or below the card.

If a finding is genuinely plain-text-only (no shape fits — `02_resource_research_method.md`'s honest
"no consensus winner" case, or a one-off fact with no structure), the summary line *is* the content and
should stay concise, not padded to look substantial.

## Documenting what was actually read — `metadata.detail`

"Visual-first" above governs the `summary` line and the compact card/diagram — what's glanceable on the
report and on a library shelf tile. It does not mean the *library* entry should stop at that same
one-liner. Investigating a concept or field means actually reading through real sources — a Wikipedia
article, a paper, a history-of-the-idea writeup — and that reading turns up substance a 1-2 sentence
`definition` can't hold: the history of how the idea was discovered or contested, its real limitations,
how later work extended or reinterpreted it, a genuinely surprising or non-obvious result. That substance
belongs in the library, not just in your own working memory for one cycle — the whole point of
`mind_knowledge_library` is to be the durable record of everything learned, not a teaser for it.

Write it to `metadata.detail`: a plain string, paragraphs separated by a blank line (`\n\n`), a few
paragraphs where the reading actually supports it (empty/omitted when there genuinely isn't more than the
one-liner — don't pad). This is separate from `summary` and from the structured card fields, and it does
NOT render inline on the compact report or the library shelf tile — it only appears in the library entry's
own detail window, which exists precisely because this content can run long. Concretely for a concept
entry: `definition`/`branch`/`philosophers` stay terse and card-shaped as already specified; `metadata.detail`
is where the Nash-equilibrium-style substance goes — e.g. the proof method behind an existence result, a
known limitation or open problem, how the idea was later reinterpreted in an adjacent field, a hard
computational or empirical result tied to it. Ground every claim in `detail` the same way
`02_resource_research_method.md` already requires for anything beyond common-knowledge definitions — it
should trace to a real source in `source_refs`, not be invented to look substantial.

## Changelog

- 2026-07-17: initial version — Field Investigation Report reframe, concept/definition shape with
  philosophy-branch and philosopher lineage, durable `mind_knowledge_library` persistence step.
- 2026-07-18: `mind_knowledge_library` now gets every investigated finding, not only report-worthy ones —
  added the `surfaced` column (true = also in this cycle's report, false = filtered-out background
  research the library alone remembers) so the library reflects everything learned, not just what's shown.
- 2026-07-18: added `metadata.detail` — the library entry's own detail window (not the compact card/report)
  now carries the substantive notes from actually reading sources, not just the short definition/card.
