# Meta-map: what to figure out about the user (and in what order)

This is the built-in map for the `user_model` insights (§4b of MIND_MODEL_BRIEF.md). The user never
specifies what to learn about them — this document IS the "what to figure out," already figured out.
Work through it top-down as data volume allows. Never overreach beyond what the data supports.

## Warning first: do NOT model "learning styles"

The visual/auditory/kinesthetic learning-styles framework is a debunked myth — no study shows teaching
to a preferred modality improves outcomes, and labeling can actively harm (a "visual learner" avoids
subjects that don't seem to match). Do not classify the user this way. Match format to the *content*
(diagrams for processes, cases for judgment calls), not to a supposed style.
Sources: https://poorvucenter.yale.edu/teaching/teaching-resource-library/learning-styles-as-a-myth ,
https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5366351/

## What actually predicts learning success (model these instead)

Prior knowledge and self-regulated learning behaviors are stronger predictors than any style-based
personalization. The evidence-backed dimensions, which are the tiers below, come from self-regulated
learning research (cognition, metacognition, motivation, behavior/context) and the Dunlosky et al. 2013
technique rankings.
Sources: https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1765181/full ,
https://lincs.ed.gov/federal-initiatives/teal/guide/selfregulated

## Tier 1 — thin data (first weeks; a handful of notes/events)

Only directly observable behavior. Phrase everything as counts, never character claims.

- **Active topics**: what tags/clusters are being captured right now.
- **Capture vs. completion ratio**: notes created vs. distilled/turned into tasks.
- **Session rhythm**: time-of-day of captures and focus sessions; typical focus duration.
- **Stated intentions**: goals the user literally wrote in note content (quote them, don't infer).

## Tier 2 — moderate data (a month+; dozens of notes, regular activity_log flow)

Patterns across time, still descriptive.

- **Follow-through pattern**: median time-to-abandon; what kinds of items get finished vs. stalled.
- **Breadth vs. depth tendency**: many shallow clusters vs. few deep ones; revisit rate per cluster.
- **Prior-knowledge estimate per cluster**: novice (capturing definitions/tutorials) vs. advanced
  (capturing critiques, edge cases, original synthesis). This drives resource difficulty in
  recommendations.
- **Activation-energy profile**: what precedes a productive streak (a small task? a focus session?),
  what precedes abandonment.

## Tier 3 — rich data (months; longitudinal record)

Careful interpretation, always with heavy `source_refs` and superseding older reads.

- **Motivation signature**: which goals sustain effort over weeks vs. spike-and-die (self-determination
  lens: self-chosen interests vs. "should" projects).
- **Metacognitive habits**: does the user plan/review (distill, link notes) or only capture? SRL research
  says planning–monitoring–reflection cycles are trainable and high-leverage.
- **Goal trajectory**: how inferred goals evolved; which were confirmed/corrected by the user.
- **Personal effectiveness evidence**: which past approaches *in their own data* actually led to
  completed work — the user's own n=1 record beats generic advice once it exists.

## Rules

1. State the tier you're operating at in the `user_model` row's metadata, and why (row counts).
2. A conclusion may only use signals from its own tier or below.
3. User corrections on the dashboard are Tier-0 truth — they override any inference and get logged.
4. Every claim carries `source_refs` to the exact notes/events behind it.
