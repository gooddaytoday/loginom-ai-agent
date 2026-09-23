import { writeSync } from "node:fs"

export function exitOnFatalErrors(name: string) {
  for (const event of ["uncaughtException", "unhandledRejection"] as const)
    process.on(event, (error: unknown) => {
      writeSync(2, `${name} ${event}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
      process.exit(1)
    })
}
