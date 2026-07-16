// One-time (re-runnable) seed of mind_topics — the tree components/KnowledgeGalaxy.js
// used to hold as a hardcoded TAXONOMY constant now lives in the database (see
// mind_knowledge/05_topic_map_method.md) so a refresh cycle can grow it. This script
// just carries the existing seed tree over so the map doesn't go blank on the first
// deploy after the migration; from then on the DB copy is canonical, same posture as
// seed-mind-knowledge.js.
const { Client } = require('pg')
const { loadEnvLocal } = require('./loadEnv')

loadEnvLocal()

const NODES = [
  { slug: 'root', parent: null, name: 'All Knowledge', cluster: 'root' },

  { slug: 'science', parent: 'root', name: 'Science', cluster: 'science' },
  { slug: 'biology', parent: 'science', name: 'Biology', cluster: 'science' },
  { slug: 'neuroscience', parent: 'biology', name: 'Neuroscience', cluster: 'science' },
  { slug: 'neurobiology', parent: 'neuroscience', name: 'Neurobiology', cluster: 'science', goalName: 'Neurobiology' },
  { slug: 'neuroanatomy', parent: 'neuroscience', name: 'Neuroanatomy', cluster: 'science' },
  { slug: 'neurophysiology', parent: 'neuroscience', name: 'Neurophysiology', cluster: 'science' },
  { slug: 'cogneuro', parent: 'neuroscience', name: 'Cognitive Neuroscience', cluster: 'science' },
  { slug: 'genetics', parent: 'biology', name: 'Genetics', cluster: 'science' },
  { slug: 'cellbio', parent: 'biology', name: 'Cell Biology', cluster: 'science' },
  { slug: 'psychology', parent: 'science', name: 'Psychology', cluster: 'science' },
  { slug: 'cogpsych', parent: 'psychology', name: 'Cognitive Psychology', cluster: 'science' },
  { slug: 'clinpsych', parent: 'psychology', name: 'Clinical Psychology', cluster: 'science' },
  { slug: 'physics', parent: 'science', name: 'Physics', cluster: 'science' },

  { slug: 'technology', parent: 'root', name: 'Technology', cluster: 'technology' },
  { slug: 'compsci', parent: 'technology', name: 'Computer Science', cluster: 'technology' },
  { slug: 'ai', parent: 'compsci', name: 'Artificial Intelligence', cluster: 'technology' },
  { slug: 'ml', parent: 'ai', name: 'Machine Learning', cluster: 'technology' },
  { slug: 'nlp', parent: 'ai', name: 'Natural Language Processing', cluster: 'technology' },
  { slug: 'pkm', parent: 'compsci', name: 'Personal Knowledge Management', cluster: 'technology' },
  { slug: 'secondbrain', parent: 'pkm', name: 'Second Brain & PARA Method', cluster: 'technology', goalName: 'Mind Model' },
  { slug: 'notetaking', parent: 'pkm', name: 'Note-Taking Systems', cluster: 'technology' },
  { slug: 'robotics', parent: 'technology', name: 'Robotics', cluster: 'technology' },

  { slug: 'business', parent: 'root', name: 'Business', cluster: 'business' },
  { slug: 'entrepreneurship', parent: 'business', name: 'Entrepreneurship', cluster: 'business' },
  { slug: 'ecommerce', parent: 'entrepreneurship', name: 'E-Commerce Operations', cluster: 'business', goalName: 'Satoshi' },
  { slug: 'marketing', parent: 'entrepreneurship', name: 'Marketing', cluster: 'business' },
  { slug: 'finance', parent: 'business', name: 'Finance', cluster: 'business' },

  { slug: 'humanities', parent: 'root', name: 'Humanities', cluster: 'humanities' },
  { slug: 'philosophy', parent: 'humanities', name: 'Philosophy', cluster: 'humanities' },
  { slug: 'metaphysics', parent: 'philosophy', name: 'Metaphysics', cluster: 'humanities' },
  { slug: 'ontology', parent: 'metaphysics', name: 'Ontology', cluster: 'humanities' },
  { slug: 'philmind', parent: 'metaphysics', name: 'Philosophy of Mind', cluster: 'humanities' },
  { slug: 'epistemology', parent: 'philosophy', name: 'Epistemology', cluster: 'humanities' },
  { slug: 'ethics', parent: 'philosophy', name: 'Ethics', cluster: 'humanities' },
  { slug: 'logic', parent: 'philosophy', name: 'Logic', cluster: 'humanities' },
  { slug: 'aesthetics', parent: 'philosophy', name: 'Aesthetics', cluster: 'humanities' },
  { slug: 'polphil', parent: 'philosophy', name: 'Political Philosophy', cluster: 'humanities' },
  { slug: 'history', parent: 'humanities', name: 'History', cluster: 'humanities' },
  { slug: 'linguistics', parent: 'humanities', name: 'Linguistics', cluster: 'humanities' },
  { slug: 'literature', parent: 'humanities', name: 'Literature', cluster: 'humanities' }
]

async function main() {
  const connectionString = process.env.DATABASE_URL
  const email = process.env.SEED_EMAIL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    process.exit(1)
  }
  if (!email) {
    console.error('Set SEED_EMAIL in .env.local (the account this tree belongs to).')
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

  for (let i = 0; i < NODES.length; i++) {
    const n = NODES[i]
    await client.query(
      `INSERT INTO mind_topics (user_id, slug, parent_slug, name, cluster, goal_name, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, slug) DO UPDATE
         SET parent_slug = EXCLUDED.parent_slug, name = EXCLUDED.name,
             cluster = EXCLUDED.cluster, goal_name = EXCLUDED.goal_name,
             position = EXCLUDED.position, updated_at = now()`,
      [userId, n.slug, n.parent, n.name, n.cluster, n.goalName || null, i]
    )
    console.log(`Upserted: ${n.slug}`)
  }

  await client.end()
}

main().catch(err => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
