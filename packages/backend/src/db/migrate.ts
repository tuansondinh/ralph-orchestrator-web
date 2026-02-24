import { closeDatabase, createDatabase, initializeDatabase } from './connection.js'

function main() {
  const connection = createDatabase()
  initializeDatabase(connection)
  closeDatabase(connection)
}

main()
