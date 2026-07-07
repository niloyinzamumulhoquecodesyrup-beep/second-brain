import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

let pool = null

if (connectionString) {
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = new Pool({ connectionString })
  }
  pool = globalThis.__pgPool
}

export function getPool() {
  if (!pool) throw new Error('DATABASE_URL environment variable is not set')
  return pool
}

export function hasDb() {
  return !!pool
}
