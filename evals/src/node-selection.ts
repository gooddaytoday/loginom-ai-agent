export type SelectionMode = "standard" | "explicit-js" | "capability-gap" | "standard-recovery"

export function inspectSelectionHistory(input: { snapshot: unknown; events: unknown[] }) {
  const snapshot = record(input.snapshot) ? input.snapshot : undefined
  const failures: string[] = []
  if (!snapshot || typeof snapshot.sessionID !== "string" || snapshot.parentID !== null
    || !Array.isArray(snapshot.childSessionIDs) || snapshot.childSessionIDs.length
    || !Array.isArray(snapshot.messages) || !snapshot.messages.length || !Array.isArray(snapshot.parts))
    return { historyComplete: false, failures: ["SNAPSHOT_INVALID"] }
  const messages = snapshot.messages.filter(record)
  const parts = snapshot.parts.filter(record)
  if (messages.length !== snapshot.messages.length || parts.length !== snapshot.parts.length
    || messages.some((message) => message.sessionID !== snapshot.sessionID || typeof message.id !== "string")
    || !messages.some((message) => message.role === "user") || !messages.some((message) => message.role === "assistant"))
    failures.push("HISTORY_IDENTITY_INVALID")
  const byID = new Map<string, Record<string, unknown>>()
  for (const part of parts) {
    if (typeof part.id !== "string" || byID.has(part.id) || part.sessionID !== snapshot.sessionID
      || !messages.some((message) => message.id === part.messageID)) failures.push("PART_IDENTITY_INVALID")
    if (typeof part.id === "string") byID.set(part.id, part)
    if (part.type !== "tool") continue
    if (typeof part.tool !== "string" || !record(part.state) || !["completed", "error"].includes(String(part.state.status))
      || !record(part.state.input)) failures.push("TOOL_EVIDENCE_INVALID")
    if (part.tool === "loginom_dock_node_apply" && (!record(part.state) || !record(part.state.input)
      || !record(part.state.input.target) || typeof part.state.input.target.type !== "string"
      || !part.state.input.target.type.trim())) failures.push("TOOL_INPUT_INCOMPLETE")
  }
  if (!input.events.length) failures.push("EVENTS_MISSING")
  const terminals = new Set<string>()
  for (const event of input.events) {
    if (!record(event) || event.sessionID !== snapshot.sessionID
      || !["step_start", "step_finish", "text", "reasoning", "tool_use", "error"].includes(String(event.type))) {
      failures.push("EVENT_IDENTITY_INVALID")
      continue
    }
    if (event.type !== "tool_use") continue
    const part = record(event.part) ? event.part : undefined
    const saved = typeof part?.id === "string" ? byID.get(part.id) : undefined
    if (!part || !saved || !record(part.state) || !record(saved.state)
      || part.type !== "tool" || part.tool !== saved.tool || part.sessionID !== snapshot.sessionID
      || JSON.stringify([part.state.status, part.state.input, part.state.output, part.state.error])
        !== JSON.stringify([saved.state.status, saved.state.input, saved.state.output, saved.state.error]))
      failures.push("TERMINAL_PART_MISMATCH")
    if (typeof part?.id === "string") terminals.add(part.id)
  }
  if (parts.some((part) => part.type === "tool" && !terminals.has(String(part.id)))) failures.push("TERMINAL_EVENT_MISSING")
  return { historyComplete: failures.length === 0, failures: [...new Set(failures)] }
}

export function inspectSelection(input: {
  mode: SelectionMode
  nodeTypes: string[] | null
  parts: unknown[]
}): { jsNodes: number | null; jsCalls: number; successfulJsCalls: number; failures: string[] } {
  const jsNodes = input.nodeTypes?.filter((type) =>
    ["TBGJavaScriptEngine", "TBGCodeModelComponentEngine"].includes(type)).length ?? null
  const calls = input.parts.flatMap((part) => readApply(part, input.parts))
  const jsCalls = calls.filter((call) => call.nodeType === "programming.javascript").length
  const successfulJsCalls = calls.filter((call) => call.nodeType === "programming.javascript" && call.succeeded).length
  const standard = input.mode === "standard" || input.mode === "standard-recovery"
  return {
    jsNodes,
    jsCalls,
    successfulJsCalls,
    failures: [
      ...calls.flatMap((call) => call.failure ? [call.failure] : []),
      ...(standard && (jsNodes || jsCalls)
        ? ["JAVASCRIPT_NOT_ALLOWED"] : []),
      ...(!standard && !jsNodes ? ["JAVASCRIPT_NODE_REQUIRED"] : []),
      ...(!standard && !successfulJsCalls ? ["JAVASCRIPT_EXECUTION_REQUIRED"] : []),
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
    succeeded: typeof part.id === "string" && typeof part.sessionID === "string" && typeof request?.operation_id === "string"
      && state?.status === "completed" && terminal?.operation_id === request.operation_id
      && terminal?.state === "settled" && terminal.status === "SUCCEEDED"
      && terminal.cleanup_complete === true && record(terminal.execution) && terminal.execution.status === "completed"
      && node?.document_id === request?.document_id && record(request?.workflow_ref)
      && node?.workflow_id === request.workflow_ref.workflow_id && typeof node?.node_id === "string",
    failure: typeof target?.type !== "string" || !target.type.trim() ? "TOOL_INPUT_INCOMPLETE"
      : typeof part.id !== "string" || !state || !["pending", "running", "completed", "error"].includes(String(state.status))
        ? "TOOL_EVIDENCE_INVALID" : undefined,
  }]
}

function receipt(part: Record<string, unknown>): unknown {
  if (!record(part.state)) return undefined
  if (record(part.state.metadata) && part.state.metadata.truncated === true) return undefined
  const value = part.state.status === "error" ? part.state.error : part.state.output
  if (typeof value !== "string") return value
  try { return JSON.parse(value) as unknown } catch { return undefined }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
