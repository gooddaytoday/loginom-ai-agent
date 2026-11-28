import { appendFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

// Desktop launches this entry only in the temporary test build. A failed CLI exits before it registers.
if (process.env.DESKTOP_WINDOW_STARTUP_FAILURE) {
  console.error(process.env.DESKTOP_WINDOW_STARTUP_FAILURE)
  process.exit(23)
}

// Record ownership for the crash test and let the OS choose an unused loopback port for each service.
await appendFile(process.env.DESKTOP_WINDOW_SERVICE_PIDS, process.pid + "\n")

process.argv.push("--hostname", "127.0.0.1", "--port", "0")

await import(pathToFileURL(process.env.DESKTOP_WINDOW_CLI_SOURCE).href)
