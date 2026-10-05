// Synchronous source/context reads include owned opening and cleanup. Cursor
// continuations carry no public budget; the reader retains its original deadline.
export function runtimeCallTimeout(name, args) {
  if (name !== "dock_node_read" || !args || typeof args !== "object"
    || !["source", "context"].includes(args.kind)) return 105_000
  const budget = args.cursor !== undefined ? 1_800_000
    : Number.isSafeInteger(args.budget_ms) && args.budget_ms >= 1 && args.budget_ms <= 1_800_000
      ? args.budget_ms : args.kind === "context" ? 600_000 : 300_000
  return budget + 15_000
}
