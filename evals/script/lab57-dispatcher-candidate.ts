import { dispatcherBrowserCode } from "../src/lab57-dispatcher-browser"
import { correlateDispatcher, stableDispatcherDecision } from "../src/lab57-dispatcher"
import type { OriginalBinding } from "../src/lab57-dispatcher"
// No login, MCP connection, recover/acquire/release or resource mutation in this entrypoint.
const [command,...files] = Bun.argv.slice(2)
if (command === "emit-observer" && files.length === 0) {
  console.log(dispatcherBrowserCode())
} else if (command === "check" && files.length === 3 && files.every(f => !f.startsWith("--"))) {
  try {
    const original = await Bun.file(files[0]!).json() as OriginalBinding
    const first = await Bun.file(files[1]!).json(), second = await Bun.file(files[2]!).json()
    correlateDispatcher(first,original)
    const decision = stableDispatcherDecision(first,second,original)
    console.log(JSON.stringify({version:1,status:"OFFLINE_CANDIDATE_VERIFIED",applied:false,nativeReady:false,
      serverCessation:"UNPROVEN",cleanup:"UNCONFIRMED",decision},null,2))
  } catch {
    console.log(JSON.stringify({status:"BLOCKED",applied:false,reason:"OFFLINE_BINDING_OR_INVENTORY_REFUSED"}));process.exit(2)
  }
} else {
  console.log(JSON.stringify({status:"SOURCE_ONLY",applied:false,reason:"LIVE_NOT_ASSIGNED"}));process.exit(2)
}
