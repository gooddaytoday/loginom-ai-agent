import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { prepareDashboard, readDashboardSnapshot, withSnapshot } from "../../src/agent/folder.ts"

const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
if (input.action === "read") {
  console.log("reading")
  console.log(JSON.stringify(readDashboardSnapshot(input.work) ?? null))
}
if (input.action === "lock") {
  withSnapshot(input.work, () => {
    console.log("paused")
    process.kill(process.pid, "SIGSTOP")
  })
}
if (input.action === "refresh") {
  // Observe real file replacement at the public snapshot boundary; preserve all I/O.
  const rename = fs.renameSync
  fs.renameSync = (source, destination) => {
    rename(source, destination)
    if (!String(destination).endsWith("/snapshot.json")) return
    console.log("paused")
    process.kill(process.pid, "SIGSTOP")
  }
  syncBuiltinESMExports()
  await prepareDashboard({ ...input.options, fetch: async () => Response.json(input.snapshot) })
}
