import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/postgres.ts',
  out: './drizzle/postgres',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/ralph'
  },
  strict: true
})
