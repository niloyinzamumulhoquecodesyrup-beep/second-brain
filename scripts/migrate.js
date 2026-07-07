const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const { loadEnvLocal } = require('./loadEnv')

loadEnvLocal()

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    process.exit(1)
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  })
  await client.connect()

  const dir = path.join(__dirname, '..', 'migrations')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    console.log(`Running migration: ${file}`)
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    await client.query(sql)
  }

  console.log('Migrations complete.')
  await client.end()
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
