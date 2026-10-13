export type SelectionMode = "standard" | "explicit-js" | "capability-gap" | "standard-recovery"

export function inspectSelection(input: {
  mode: SelectionMode
  nodeTypes: string[] | null
  parts: unknown[]
}): { jsNodes: number | null; jsCalls: number; successfulJsCalls: number; failures: string[] } {
  const jsNodes = input.nodeTypes?.filter((type) =>
    ["TBGJavaScriptEngine", "TBGCodeModelComponentEngine"].includes(type)).length ?? null
  const calls = input.parts.filter(record).filter((part) => part.type === "tool"
    && part.tool === "loginom_dock_node_apply").map((part) => {
    const state = record(part.state) ? part.state : undefined
    const target = record(state?.input) && record(state.input.target) ? state.input.target : undefined
    return {
      nodeType: typeof target?.type === "string" ? target.type : undefined,
      failure: typeof target?.type !== "string" || !target.type.trim() ? "TOOL_INPUT_INCOMPLETE" : undefined,
    }
  })
  const jsCalls = calls.filter((call) => call.nodeType === "programming.javascript").length
  return {
    jsNodes,
    jsCalls,
    successfulJsCalls: 0,
    failures: [
      ...calls.flatMap((call) => call.failure ? [call.failure] : []),
      ...((input.mode === "standard" || input.mode === "standard-recovery") && (jsNodes || jsCalls)
        ? ["JAVASCRIPT_NOT_ALLOWED"] : []),
    ],
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
