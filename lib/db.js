import { Pool, types } from 'pg'

// pg's default DATE parser builds a JS Date from the column's date-only string using
// the server's LOCAL timezone, then every downstream .toISOString()/res.json() call
// renders it back in UTC -- on a server whose local time is ahead of UTC (this one is
// UTC+6), that silently shifts every due_date/plan_date back by one calendar day. A
// DATE column has no time-of-day or timezone component to begin with, so the only
// correct fix is to stop converting it to a Date at all and keep the raw string
// Postgres actually returns (e.g. '2026-07-22'). Global to the process, set once here
// before any query runs.
types.setTypeParser(types.builtins.DATE, val => val)

const connectionString = process.env.DATABASE_URL

let pool = null

if (connectionString) {
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    })
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
