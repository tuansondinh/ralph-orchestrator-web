import { closeDatabase, createDatabase, initializeDatabase } from './connection.js'
import { projects } from './schema.js'

function main() {
  const connection = initializeDatabase(createDatabase())

  const hasProjects =
    connection.db.select({ id: projects.id }).from(projects).limit(1).get() != null

  if (!hasProjects) {
    const now = Date.now()
    connection.db.insert(projects).values({
      id: 'sample-project',
      name: 'Sample Project',
      path: '/tmp/sample-project',
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now
    })
  }

  closeDatabase(connection)
}

main()
