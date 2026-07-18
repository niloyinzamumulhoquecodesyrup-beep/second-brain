# Topic map method: growing the knowledge-galaxy tree

This backs the `mind_topics` table, which drives the map rendered by `components/KnowledgeGalaxy.js`
("Interest clusters & how you work"). That map used to be a hardcoded tree living only in the component;
it now lives in the database so a refresh cycle can grow it with real judgment, the same self-directed
posture `00_meta_map.md` already established for `user_model` — the "figure out what to figure out" step
is pre-figured here too, this time for "where does this interest belong on the map."

## Row shape

`user_id, slug, parent_slug, name, cluster, goal_name, position, active`. `slug` is the stable key —
`parent_slug` points at another row's `slug` for this account (or `NULL` for the single root row, which
already exists and must never be touched by a cycle). Upsert by `(user_id, slug)`; this is what makes
re-running a cycle safe. Once a node exists, never change its `slug` — that would silently orphan any
children whose `parent_slug` points at it, and break the `goal_name` join to `mind_insights`. If wording
needs to improve, update `name`, not `slug`.

## When a new node is actually warranted

A node earns its place by recurrence, not by a single mention. One note that happens to reference
"aerodynamics" in passing is not evidence the user has an interest area there — it's noise, and a map
that lights up on every passing word stops meaning anything. Look for the same signal `interest_cluster`
and `inferred_goal` already require: multiple notes/activity events, or a `note_links` cluster, genuinely
about the same topic over time.

## How many nodes to add — tiered by how much the evidence actually spans

- **Fits under an existing node** (e.g. a new specific leaf under the already-present `physics` hub):
  add exactly **one** leaf. Do not invent intermediate hubs that only ever have one child.
- **A genuinely new field with no existing home**, and enough recurring evidence that it has real
  internal structure (multiple distinct recurring sub-topics, not just one): add a short chain — one
  connecting hub plus its leaf/leaves — but never deeper than the evidence actually spans. A field
  represented by a single recurring topic gets a single leaf under the nearest fitting existing hub
  (or directly under root if truly nothing fits), not a hub-with-one-child.
- **Cap per cycle**: at most 5 new nodes, same batching discipline as `para_fun_queue` — this keeps the
  map legible and stops a single rich cycle from restructuring the whole tree at once.

## `goal_name` — the live join, used sparingly

Set `goal_name` only on the one leaf that corresponds exactly to a live `inferred_goal` row's
`metadata.name` (exact string match — this is the join key the map uses to light a node up and show its
`source_refs`). Most nodes — structural hubs, and leaves that represent a field of knowledge without a
dedicated live goal yet — should leave `goal_name` null. That is correct, not a gap: the map is supposed
to show the dim shape of fields nothing has lit up yet, same as the original hardcoded seed did.

## Being investigated is not the same evidence as being a rich branch

`field_investigation_method` can write a detailed `mind_knowledge_library` entry for a term the user has
barely touched — one passing mention was enough to justify looking it up, even though it's nowhere near
the recurrence bar this doc sets for growing the tree. The map's renderer joins a leaf to its library
entry (by matching title) as a *second*, independent way a node can light up alongside `goal_name`, so
that genuinely-investigated-but-not-yet-a-goal topics (Ontology, say) show up as known rather than sitting
permanently dim. But it sizes that join conservatively on purpose: a concept revisited across several
cycles (bumping `cycle_count`) renders as a small, lit leaf regardless of how many times it's been
reinforced, never scaling up to look like a real branch of captured notes the way a `goal_name` match
with several `source_refs` does. Don't try to compensate for this from the data side — a library entry
being detailed (philosophers, related concepts, a full `metadata.detail`) is not itself grounds to place
its node any less conservatively than the recurrence rule above already requires, or to give it
`goal_name`/children it hasn't earned. If a topic genuinely does become a recurring interest later, that
shows up as real notes and a real `inferred_goal` — let the tree catch up then, not preemptively now.

## Retiring a node

Never delete a row. If a topic has clearly been abandoned long enough that it would otherwise qualify as
its own `dormant_revival`, set `active=false` instead — same supersede-don't-destroy posture as
`mind_insights`/`mind_sections`. Don't be trigger-happy about this: the bar is the same one
`dormant_revival` already uses (real prior activity, then a real long gap), not "quiet this week."

## Cluster colors

Reuse an existing `cluster` value (`science`, `technology`, `business`, `humanities`) whenever the new
node genuinely fits one of those. Introducing a brand-new top-level cluster should be rare — reserve it
for a real new top-level domain, not a subtopic of one that already exists. A cluster name with no
matching entry in `components/KnowledgeGalaxy.js`'s `CLUSTER_RGB` just renders in the neutral fallback
color, which is fine short-term, but note it in a `scope='user'` `mind_knowledge` calibration row so it's
not silently lost — that file is one of the few places this system's logic still lives outside the
database, so a change there needs a human (or a future cycle with file-write access) to actually pick it
up.
