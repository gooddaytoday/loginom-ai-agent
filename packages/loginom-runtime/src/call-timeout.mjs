// Synchronous source/context reads include owned opening and cleanup. Cursor
// continuations carry no public budget; the reader retains its original deadline.
export function runtimeCallTimeout(name, args) {
  // Prepare owns up to 120 s in the browser (125 s transport), followed by a
  // separate 15 s geometry read. Let those bounded replies reach the owner;
  // this IPC allowance does not extend the browser's preparation deadline.
  if (name === "dock_prepare") return 155_000
  // Recovery start waits for the original executor stop and finish composes
  // release-proof (up to 90 s) with result readers; both stay bounded here.
  if (name === "dock_browser_recovery") return 300_000
  if (name !== "dock_node_read" || !args || typeof args !== "object"
    || !["source", "context"].includes(args.kind)) return 105_000
  const budget = args.cursor !== undefined ? 1_800_000
    : Number.isSafeInteger(args.budget_ms) && args.budget_ms >= 1 && args.budget_ms <= 1_800_000
      ? args.budget_ms : args.kind === "context" ? 600_000 : 300_000
  return budget + 15_000
}
