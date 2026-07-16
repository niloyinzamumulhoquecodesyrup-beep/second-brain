import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// The knowledge-galaxy tree (mind_knowledge topic "topic_map_method") used to be a
// hardcoded TAXONOMY constant in components/KnowledgeGalaxy.js; it now lives in
// mind_topics so a refresh cycle can grow it. If no cycle has ever written rows for
// this account (fresh install, migration just ran, seed script not run yet), fall
// back to the original seed tree so the map never renders empty — same posture as
// pages/api/mind/sections.js's FALLBACK_SECTIONS.
const FALLBACK_TOPICS = [
  { slug: 'root', parent_slug: null, name: 'All Knowledge', cluster: 'root', goal_name: null },

  { slug: 'science', parent_slug: 'root', name: 'Science', cluster: 'science', goal_name: null },
  { slug: 'biology', parent_slug: 'science', name: 'Biology', cluster: 'science', goal_name: null },
  { slug: 'neuroscience', parent_slug: 'biology', name: 'Neuroscience', cluster: 'science', goal_name: null },
  { slug: 'neurobiology', parent_slug: 'neuroscience', name: 'Neurobiology', cluster: 'science', goal_name: 'Neurobiology' },
  { slug: 'neuroanatomy', parent_slug: 'neuroscience', name: 'Neuroanatomy', cluster: 'science', goal_name: null },
  { slug: 'neurophysiology', parent_slug: 'neuroscience', name: 'Neurophysiology', cluster: 'science', goal_name: null },
  { slug: 'cogneuro', parent_slug: 'neuroscience', name: 'Cognitive Neuroscience', cluster: 'science', goal_name: null },
  { slug: 'genetics', parent_slug: 'biology', name: 'Genetics', cluster: 'science', goal_name: null },
  { slug: 'cellbio', parent_slug: 'biology', name: 'Cell Biology', cluster: 'science', goal_name: null },
  { slug: 'psychology', parent_slug: 'science', name: 'Psychology', cluster: 'science', goal_name: null },
  { slug: 'cogpsych', parent_slug: 'psychology', name: 'Cognitive Psychology', cluster: 'science', goal_name: null },
  { slug: 'clinpsych', parent_slug: 'psychology', name: 'Clinical Psychology', cluster: 'science', goal_name: null },
  { slug: 'physics', parent_slug: 'science', name: 'Physics', cluster: 'science', goal_name: null },

  { slug: 'technology', parent_slug: 'root', name: 'Technology', cluster: 'technology', goal_name: null },
  { slug: 'compsci', parent_slug: 'technology', name: 'Computer Science', cluster: 'technology', goal_name: null },
  { slug: 'ai', parent_slug: 'compsci', name: 'Artificial Intelligence', cluster: 'technology', goal_name: null },
  { slug: 'ml', parent_slug: 'ai', name: 'Machine Learning', cluster: 'technology', goal_name: null },
  { slug: 'nlp', parent_slug: 'ai', name: 'Natural Language Processing', cluster: 'technology', goal_name: null },
  { slug: 'pkm', parent_slug: 'compsci', name: 'Personal Knowledge Management', cluster: 'technology', goal_name: null },
  { slug: 'secondbrain', parent_slug: 'pkm', name: 'Second Brain & PARA Method', cluster: 'technology', goal_name: 'Mind Model' },
  { slug: 'notetaking', parent_slug: 'pkm', name: 'Note-Taking Systems', cluster: 'technology', goal_name: null },
  { slug: 'robotics', parent_slug: 'technology', name: 'Robotics', cluster: 'technology', goal_name: null },

  { slug: 'business', parent_slug: 'root', name: 'Business', cluster: 'business', goal_name: null },
  { slug: 'entrepreneurship', parent_slug: 'business', name: 'Entrepreneurship', cluster: 'business', goal_name: null },
  { slug: 'ecommerce', parent_slug: 'entrepreneurship', name: 'E-Commerce Operations', cluster: 'business', goal_name: 'Satoshi' },
  { slug: 'marketing', parent_slug: 'entrepreneurship', name: 'Marketing', cluster: 'business', goal_name: null },
  { slug: 'finance', parent_slug: 'business', name: 'Finance', cluster: 'business', goal_name: null },

  { slug: 'humanities', parent_slug: 'root', name: 'Humanities', cluster: 'humanities', goal_name: null },
  { slug: 'philosophy', parent_slug: 'humanities', name: 'Philosophy', cluster: 'humanities', goal_name: null },
  { slug: 'metaphysics', parent_slug: 'philosophy', name: 'Metaphysics', cluster: 'humanities', goal_name: null },
  { slug: 'ontology', parent_slug: 'metaphysics', name: 'Ontology', cluster: 'humanities', goal_name: null },
  { slug: 'philmind', parent_slug: 'metaphysics', name: 'Philosophy of Mind', cluster: 'humanities', goal_name: null },
  { slug: 'epistemology', parent_slug: 'philosophy', name: 'Epistemology', cluster: 'humanities', goal_name: null },
  { slug: 'ethics', parent_slug: 'philosophy', name: 'Ethics', cluster: 'humanities', goal_name: null },
  { slug: 'logic', parent_slug: 'philosophy', name: 'Logic', cluster: 'humanities', goal_name: null },
  { slug: 'aesthetics', parent_slug: 'philosophy', name: 'Aesthetics', cluster: 'humanities', goal_name: null },
  { slug: 'polphil', parent_slug: 'philosophy', name: 'Political Philosophy', cluster: 'humanities', goal_name: null },
  { slug: 'history', parent_slug: 'humanities', name: 'History', cluster: 'humanities', goal_name: null },
  { slug: 'linguistics', parent_slug: 'humanities', name: 'Linguistics', cluster: 'humanities', goal_name: null },
  { slug: 'literature', parent_slug: 'humanities', name: 'Literature', cluster: 'humanities', goal_name: null }
]

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT slug, parent_slug, name, cluster, goal_name, position
     FROM mind_topics
     WHERE user_id = $1 AND active = true
     ORDER BY position ASC, created_at ASC`,
    [req.user.id]
  )

  if (rows.length === 0) {
    return res.status(200).json({ topics: FALLBACK_TOPICS, isFallback: true })
  }

  return res.status(200).json({ topics: rows, isFallback: false })
}

export default requireAuth(handler)
