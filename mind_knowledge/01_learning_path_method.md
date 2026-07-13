# How to construct a learning path (roadmap / mind map) for the user

Method for building `recommendation` insights that are learning paths, not one-off resource links.
Grounded in metalearning (Scott Young's Ultralearning), deliberate practice (Ericsson), and the
roadmap.sh structure model.

## Step 1 — Metalearning: draw the map before picking resources

Answer three questions about the target skill/topic (from Ultralearning):

- **Why** is the user learning this? (Pull from their inferred_goal / stated intentions — this decides
  scope. Career-instrumental learning gets a narrower, project-directed path than curiosity learning.)
- **What** does the knowledge look like? Brainstorm three columns — **Concepts** (things to understand),
  **Facts** (things to memorize), **Procedures** (things to practice) — and mark which will be hardest.
  The column that dominates dictates the path shape: procedure-heavy → practice-first path;
  concept-heavy → explanation-first path.
- **How** do experts and successful learners actually learn it? Find the standard curriculum/roadmap for
  the field (see Step 2) before inventing one.

Source: https://www.sitepoint.com/how-to-learn-anything/ , https://dansilvestre.com/summaries/ultralearning/

## Step 2 — Find the established roadmap, don't invent one

For any established field, a vetted community roadmap probably exists. Check in order:

1. **roadmap.sh** for anything developer/tech — community-maintained, shows topic dependencies, each
   node links curated resources. Use its structure as the skeleton. (https://roadmap.sh/roadmaps/)
2. **University syllabi / MOOC curricula** (search "<topic> syllabus site:.edu", Coursera/edX course
   outlines) — reveals canonical sequencing for academic topics.
3. **Community-consensus threads** — see 02_resource_research_method.md for the search recipes.

Only construct a custom sequence when no established one fits, and say so in the recommendation.

## Step 3 — Sequence by prerequisites, but permit prerequisite chaining

Default order: prerequisites first (the roadmap.sh model — nodes with dependency edges). But
Ultralearning's "prerequisite chaining" is a valid alternative for motivated adults: start slightly too
hard at the real goal, and backfill a prerequisite only when it actually blocks progress. Choose based
on the user model: strong follow-through → chaining (more direct, more motivating); frequent
abandonment → conventional sequencing (fewer walls to bounce off).

## Step 4 — Bias toward directness and drills

- Most path nodes should be *doing the real thing* (deliberate practice), not consuming content.
  Passive-only paths fail; hands-on beats passive across community and research consensus.
- When the user stalls on a node, split out the hardest sub-skill and drill it in isolation, then
  reintegrate (the musician's method).
- Build retrieval into the path: each node should end with self-testing, and revisits should be spaced —
  practice testing and distributed practice are the only two "high utility" techniques in Dunlosky
  et al. 2013 (242 studies). Rereading/highlighting are low-utility; do not build path steps around them.
  Source: https://studytab.ai/blog/which-study-techniques-actually-work

## Step 5 — Output format: a mind-map-shaped path

Concept/mind maps measurably help retention and comprehension (meta-analyses across disciplines,
e.g. g≈0.6–1.0 in science education: https://link.springer.com/article/10.1007/s10648-024-09877-y ).
So a learning-path `recommendation` row's metadata should carry a machine-renderable tree:

```json
{
  "path": {
    "topic": "...",
    "nodes": [
      {"id": "n1", "label": "...", "type": "concept|fact|procedure",
       "requires": [], "resource": {"title": "...", "url": "...", "why_this_one": "..."},
       "practice": "the self-test / real task that closes this node"}
    ]
  },
  "keywords_used": ["the exact search queries that produced these resources"],
  "sequencing_mode": "prerequisite|chaining",
  "tier": "user-model tier this was calibrated to"
}
```

The dashboard can render `path.nodes` as an expandable tree/mind map. `keywords_used` is mandatory —
it makes the research reproducible and lets the user re-run or extend it.

## Step 6 — Calibrate to the user model, and set a timeline

Pick entry point from estimated prior knowledge per cluster (00_meta_map Tier 2); size node granularity
from the activation-energy profile (frequent abandonment → smaller nodes, one-action starts — this is
also the ADHD rule from §1 of the brief: surface exactly one next node, collapse the rest). Give the
path an overall suggested timeline — a time-box increases discipline and prevents overcommitment.
