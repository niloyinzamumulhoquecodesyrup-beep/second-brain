const { Client } = require('pg')
const bcrypt = require('bcryptjs')
const { loadEnvLocal } = require('./loadEnv')

loadEnvLocal()

async function main() {
  const connectionString = process.env.DATABASE_URL
  const email = process.env.SEED_EMAIL
  const password = process.env.SEED_PASSWORD

  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    process.exit(1)
  }
  if (!email || !password) {
    console.error('Set SEED_EMAIL and SEED_PASSWORD (in .env.local or the shell) before running this script.')
    process.exit(1)
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  })
  await client.connect()

  const passwordHash = await bcrypt.hash(password, 12)

  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, email`,
    [email, passwordHash]
  )

  console.log('Seeded user:', rows[0])
  await client.end()
}

main().catch(err => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
