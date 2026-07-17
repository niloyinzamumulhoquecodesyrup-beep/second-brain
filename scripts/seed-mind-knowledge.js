// One-time (re-runnable) seed of mind_knowledge from mind_knowledge/*.md — see
// MIND_MODEL_BRIEF.md §4c. Upserts by (user_id, scope, topic) so it's safe to re-run
// after editing a doc; the DB copy is canonical after seeding, these files are just
// the initial seed.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const { loadEnvLocal } = require('./loadEnv')

loadEnvLocal()

const DOCS = [
  { file: '00_meta_map.md', topic: 'meta_map', source_urls: [
    'https://poorvucenter.yale.edu/teaching/teaching-resource-library/learning-styles-as-a-myth',
    'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5366351/',
    'https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1765181/full',
    'https://lincs.ed.gov/federal-initiatives/teal/guide/selfregulated'
  ] },
  { file: '01_learning_path_method.md', topic: 'learning_path_method', source_urls: [
    'https://www.sitepoint.com/how-to-learn-anything/',
    'https://dansilvestre.com/summaries/ultralearning/',
    'https://roadmap.sh/roadmaps/',
    'https://studytab.ai/blog/which-study-techniques-actually-work',
    'https://link.springer.com/article/10.1007/s10648-024-09877-y'
  ] },
  { file: '02_resource_research_method.md', topic: 'resource_research_method', source_urls: [
    'https://elqn.org/evaluating-the-quality-of-online-education-key-criteria/',
    'https://levelupcollege.com/how-to-verify-course-credibility-and-instructor-quality/'
  ] },
  { file: '03_refinement_loop.md', topic: 'refinement_loop', source_urls: [] },
  { file: '05_topic_map_method.md', topic: 'topic_map_method', source_urls: [] },
  { file: '06_field_investigation_method.md', topic: 'field_investigation_method', source_urls: [] },
  { file: '07_onboarding_import_method.md', topic: 'onboarding_import_method', source_urls: [] }
]

async function main() {
  const connectionString = process.env.DATABASE_URL
  const email = process.env.SEED_EMAIL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    process.exit(1)
  }
  if (!email) {
    console.error('Set SEED_EMAIL in .env.local (the account these general-scope rows belong to).')
    process.exit(1)
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  })
  await client.connect()

  const { rows: userRows } = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email])
  if (!userRows[0]) {
    console.error(`No user found for ${email}`)
    process.exit(1)
  }
  const userId = userRows[0].id

  for (const doc of DOCS) {
    const filePath = path.join(__dirname, '..', 'mind_knowledge', doc.file)
    const content = fs.readFileSync(filePath, 'utf8')

    const existing = await client.query(
      'SELECT id FROM mind_knowledge WHERE user_id=$1 AND scope=$2 AND topic=$3',
      [userId, 'general', doc.topic]
    )

    if (existing.rows[0]) {
      await client.query(
        'UPDATE mind_knowledge SET content=$1, source_urls=$2, updated_at=now() WHERE id=$3',
        [content, JSON.stringify(doc.source_urls), existing.rows[0].id]
      )
      console.log(`Updated: ${doc.topic}`)
    } else {
      await client.query(
        'INSERT INTO mind_knowledge (user_id, scope, topic, content, source_urls) VALUES ($1,$2,$3,$4,$5)',
        [userId, 'general', doc.topic, content, JSON.stringify(doc.source_urls)]
      )
      console.log(`Inserted: ${doc.topic}`)
    }
  }

  await client.end()
}

main().catch(err => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
