import type { ToolPart } from "@loginom-ai-agent/sdk/v2"

// Correlation is deliberately explicit: a different successful operation does not repair a failure.
export function runToolOutcome() {
  const unresolved = new Set<string>()
  return {
    observe(part: ToolPart) {
      if (part.state.status !== "completed" && part.state.status !== "error") return
      const input = part.state.input
      const identity =
        part.tool.startsWith("loginom_") && typeof input.operation_id === "string" && input.operation_id
          ? ["operation", input.operation_id]
          : ["arguments", input]
      const key = part.tool === "invalid" ? `invalid:${part.id}` : JSON.stringify([part.tool, canonical(identity)])
      if (part.state.status === "error" || part.tool === "invalid" || part.state.metadata?.isError === true) {
        unresolved.add(key)
        return
      }
      if (part.tool.startsWith("loginom_") && part.state.metadata?.loginomPending === true) return
      unresolved.delete(key)
    },
    failed: () => unresolved.size > 0,
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  )
}
