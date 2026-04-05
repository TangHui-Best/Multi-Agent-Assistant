import { DatabaseSync } from 'node:sqlite'
import { runMigrations } from './migrations'

export function createDatabase(filename: string) {
  const db = new DatabaseSync(filename)
  runMigrations(db)
  return db
}
