# How to find and vet the *best* resources (keywords, videos, courses)

Method for the research step behind every `recommendation`. The goal is the digging most people don't
do: not the first search result, but the resource a well-informed community would actually point to.

## Step 0 — Read what the note reveals, not what it "asks"

A note is captured material, not a request directed at you — the user isn't asking the assistant
anything by writing it down. The job is to read what the note reveals about where the user actually is
on a topic and respond to that, the same mirror-not-oracle stance used everywhere else in this app.
A course/resource link is the heavy answer, and it's only right when what the note reveals is a genuine
gap to fill from outside — don't reach for it just because the topic sounds like something a course
exists for.

- **Resource-seeking** (a link is the right answer): the note *explicitly* signals wanting to find or
  choose where to learn something — "where should I learn X", "find/recommend a course on X", "what's
  the best book/video for X", "want to take a course on X". The signal has to be explicit; don't infer
  it from topic difficulty or from the field having well-known courses.
- **Not resource-seeking** (a link is the wrong answer — this is the default): everything else,
  including:
  - **A bare stated interest or goal**, with no explicit ask for where to find material — "I want to
    pursue the knowledge of neurobiology" states a destination, not a request for a course list. Treat
    it the same as any other not-resource-seeking case: build the substance (below), don't hand over a
    reading list.
  - **Review/consolidation/understanding of something already engaged with** — "learn the terms learnt
    so far" reads as wanting a refresher, not new material. Here what's needed is the content itself,
    not a pointer to where more content lives. Handing back a glossary link instead of any actual terms
    answers a need for material with a need for more material — it adds a step instead of removing one.
- When genuinely unsure which applies, default to **not resource-seeking** — direct value is the safer
  failure mode; a course link should require real, explicit signal, not be the fallback for anything
  that sounds like a "topic."

When it's not resource-seeking, deliver the substance directly instead of a link out. Pick the shape
that fits what the note is actually about:

- **A handful of terms with one-liner explainers** — for a review/consolidation ask about vocabulary
  already encountered. Pick the terms most likely already in play given the note's topic, and write the
  explainer yourself (this is common-knowledge definitional content, not a research claim, so it doesn't
  need a citation the way a course recommendation does). Note which terms are an inference from the
  note's title rather than a confirmed list, if that's the case. If an earlier cycle already gave terms
  for this topic, apply 01_learning_path_method.md Step 7 — advance to the next tier of vocabulary only
  where the user's own subsequent notes/tasks show real engagement with the earlier terms, otherwise
  reissue at the same depth.
- **A roadmap diagram** — for a bare stated interest in a whole field or skill (the neurobiology case).
  Reuse the same `metadata.path` mind-map shape from 01_learning_path_method.md — sequenced
  `concept`/`fact`/`procedure` nodes, `requires` edges, a `practice` self-test on each — but omit
  `resource` entirely on every node (no link, because this case doesn't call for one). Build the actual
  structure of the field (the standard intro sequence — what any curriculum in that field covers first,
  second, third) from general domain knowledge, the same way you'd sequence a learning path, just without
  naming external courses to do it with. This is the same rendering the dashboard already uses for
  learning paths — it's a diagram either way, just one built from explainers instead of course links.
- **One honest motivating fact or reframe** — pairs with either of the above; something true and
  specific that lowers activation energy ("you don't need much math to start being useful with AI —
  most day-to-day work is prompting and reading outputs, not deriving backprop by hand"), never generic
  hype ("you've got this!").

Format choice is open-ended — decide per recommendation, don't default to a fixed shape. But when the
content has real structure to show (a sequence, a set of terms, a comparison, anything with more than
one part), a visual — `metadata.path` (rendered as an actual node diagram, not a text list — works for
both a linear roadmap and a flat set of terms, since unconnected nodes just lay out side by side) or
`metadata.chart` (when the numbers carry a cited source) — is the higher-priority choice over a plain
paragraph, and a visual plus a short paragraph beats either alone. Plain-text-only summary is the
fallback for when there's genuinely nothing with shape to draw — e.g. an honest "no consensus winner"
result — not the default output mode.

`keywords_used` and external `source_refs` only belong on a recommendation when real outside research
actually happened (the resource-seeking case below). A terms/facts/diagram recommendation has no search
queries to log — don't invent some to fill the field.

Don't narrate this decision in the recommendation's `summary`. The intent check above is something you
work out, not something you explain to the user — no "your note's literal ask is X, not Y, so a link
would be the wrong answer" framing, no defending the format against the alternative you didn't pick, no
mentioning that a past cycle got this wrong. Write the summary as if terms/facts/a diagram were always
the natural answer: state the content plainly and directly. Keep only genuine, load-bearing honesty
(e.g. "inferred from the note's title, not a confirmed syllabus" if that caveat actually matters) —
drop everything that's really just showing your work.

## Keyword strategy — run these query shapes, in this order

1. **Community consensus first** (highest signal-to-noise for "what's actually best"):
   - `best <topic> course reddit`
   - `<topic> site:news.ycombinator.com` and `Ask HN <topic> resources`
   - `<topic> recommended resources site:reddit.com/r/<relevant-sub>` (e.g. r/learnprogramming for code,
     r/languagelearning for languages)
   Extract what multiple independent threads agree on; note explicit disagreements rather than hiding
   them. Repeated independent mentions of the same resource across years is the strongest signal there is.
2. **Canonical-structure queries**: `<topic> roadmap`, `<topic> syllabus site:.edu`, `roadmap.sh <topic>`.
3. **Recency check**: rerun winners with the current year appended — the classic pick may be outdated
   for fast-moving topics.
4. **Direct-to-source**: once a resource is named, go to its own page for the outline/instructor/reviews;
   never rely on a listicle's description.

Record the exact queries used in the recommendation's `keywords_used` metadata.

## Credibility checklist — before naming anything "well-regarded"

- **Instructor/author**: real credentials or real practitioner track record in the subject.
- **Independent reviews**: on platforms the seller doesn't control; specific and detailed, not generic
  praise. Wary of only-perfect ratings.
- **Institutional weight where it exists**: accreditation, a university/major-platform home
  (Coursera/edX/MIT OCW), or durable community endorsement (a resource HN/Reddit has recommended for
  5+ years, e.g. the way "Learning How to Learn" is the standing answer for learning-about-learning).
- **Currency**: content updated recently enough for the field's pace.
- **Red flags → discard**: urgency-heavy sales pages, unverifiable claims, no author identity,
  no refund policy on paid items.

Sources: https://elqn.org/evaluating-the-quality-of-online-education-key-criteria/ ,
https://levelupcollege.com/how-to-verify-course-credibility-and-instructor-quality/

## Confidence split (mirror-not-oracle applied to research)

- Facts about the world — "this course exists, it's taught by X, it has been the top community
  recommendation since Y" — are verifiable: state them plainly and confidently, with the URL.
- Whether the *user* should do it stays their call: frame as "given your notes on Z, this is the
  established resource for that" — never "you should take this."

## Output requirements

Every researched recommendation includes: the resource (title, URL, format, cost, time commitment),
*why this one* (the specific evidence: consensus threads, credentials, longevity), what it beat
(runners-up considered, one line each), and `keywords_used`. If research found no clearly-best resource,
say exactly that — an honest "no consensus winner; two contenders are..." is a valid result.
