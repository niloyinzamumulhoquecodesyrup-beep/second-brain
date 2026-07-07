import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

let pool

// Reuse pool during hot reloads in development
if (!globalThis.__pgPool) {
  globalThis.__pgPool = new Pool({ connectionString })
}
pool = globalThis.__pgPool

export default pool
