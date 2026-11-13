import { Database } from "bun:sqlite"

export function open(file: string) {
  return new Database(file, { create: true })
}
