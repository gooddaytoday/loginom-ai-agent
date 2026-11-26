// A private server whose graceful shutdown takes a while, as a Host closing a saved package does.
// Stdin EOF is its lease end; a signal means the owner did not wait for it.
import { appendFileSync } from "node:fs"

const marker = process.env.STANDALONE_MARKER
console.log(JSON.stringify({ url: "http://127.0.0.1:1" }))
process.on("SIGTERM", () => {
  appendFileSync(marker, "sigterm\n")
  process.exit(143)
})
process.stdin.resume()
process.stdin.on("end", () => {
  setTimeout(() => {
    appendFileSync(marker, "graceful\n")
    process.exit(0)
  }, 1500)
})
