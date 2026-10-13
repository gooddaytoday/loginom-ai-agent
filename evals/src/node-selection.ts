export type SelectionMode = "standard" | "explicit-js" | "capability-gap" | "standard-recovery"

export function inspectSelection(input: {
  mode: SelectionMode
  nodeTypes: string[] | null
  parts: unknown[]
}): { jsNodes: number | null; jsCalls: number; successfulJsCalls: number; failures: string[] } {
  const jsNodes = input.nodeTypes?.filter((type) =>
    ["TBGJavaScriptEngine", "TBGCodeModelComponentEngine"].includes(type)).length ?? null
  const calls = input.parts.flatMap((part) => readApply(part, input.parts))
  const jsCalls = calls.filter((call) => call.nodeType === "programming.javascript").length
  return {
    jsNodes,
    jsCalls,
    successfulJsCalls: calls.filter((call) => call.nodeType === "programming.javascript" && call.succeeded).length,
    failures: [
      ...calls.flatMap((call) => call.failure ? [call.failure] : []),
      ...((input.mode === "standard" || input.mode === "standard-recovery") && (jsNodes || jsCalls)
        ? ["JAVASCRIPT_NOT_ALLOWED"] : []),
    ],
  }
}

function readApply(part: unknown, parts: unknown[]) {
  if (!record(part) || part.type !== "tool" || part.tool !== "loginom_dock_node_apply") return []
  const state = record(part.state) ? part.state : undefined
  const request = record(state?.input) ? state.input : undefined
  const target = record(request?.target) ? request.target : undefined
  const receipts = parts.filter(record).filter((candidate) => candidate.sessionID === part.sessionID
    && ["loginom_dock_node_apply", "loginom_dock_node_wait", "loginom_dock_node_resume"].includes(String(candidate.tool))
    && record(candidate.state) && candidate.state.status === "completed" && record(candidate.state.input)
    && candidate.state.input.operation_id === request?.operation_id).map(receipt).filter(record)
  const terminal = receipts.at(-1)
  const node = record(terminal?.node) ? terminal.node : undefined
  return [{
    nodeType: typeof target?.type === "string" ? target.type : undefined,
    succeeded: state?.status === "completed" && terminal?.state === "settled" && terminal.status === "SUCCEEDED"
      && terminal.cleanup_complete === true && record(terminal.execution) && terminal.execution.status === "completed"
      && node?.document_id === request?.document_id && record(request?.workflow_ref)
      && node?.workflow_id === request.workflow_ref.workflow_id && typeof node?.node_id === "string",
    failure: typeof target?.type !== "string" || !target.type.trim() ? "TOOL_INPUT_INCOMPLETE" : undefined,
  }]
}

function receipt(part: Record<string, unknown>): unknown {
  if (!record(part.state)) return undefined
  const value = part.state.status === "error" ? part.state.error : part.state.output
  if (typeof value !== "string") return value
  try { return JSON.parse(value) as unknown } catch { return undefined }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
