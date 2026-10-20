import { BROWSER_RECOVERY_VERIFY_MS } from "../client/lib/browser-recovery-basis.mjs"

// Synchronous source/context reads include owned opening and cleanup. Cursor
// continuations carry no public budget; the reader retains its original deadline.
export function runtimeCallTimeout(name, args) {
  if (name === "dock_browser_recovery") return BROWSER_RECOVERY_VERIFY_MS + 15_000
  if (name !== "dock_node_read" || !args || typeof args !== "object"
    || !["source", "context"].includes(args.kind)) return 105_000
  const budget = args.cursor !== undefined ? 1_800_000
    : Number.isSafeInteger(args.budget_ms) && args.budget_ms >= 1 && args.budget_ms <= 1_800_000
      ? args.budget_ms : args.kind === "context" ? 600_000 : 300_000
  return budget + 15_000
}
