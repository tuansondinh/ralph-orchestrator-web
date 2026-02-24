import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.RALPH_UI_DB_PATH ?? './.ralph-ui/data.db'
  },
  strict: true
})
