import { DatabaseSync } from "node:sqlite"

export function open(file: string) {
  return new DatabaseSync(file)
}
