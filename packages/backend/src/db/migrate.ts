import { runDatabaseMigrations } from './migrations.js'

async function main() {
  await runDatabaseMigrations()
}

void main()
