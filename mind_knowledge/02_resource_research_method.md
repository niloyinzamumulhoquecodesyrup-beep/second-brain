# How to find and vet the *best* resources (keywords, videos, courses)

Method for the research step behind every `recommendation`. The goal is the digging most people don't
do: not the first search result, but the resource a well-informed community would actually point to.

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
