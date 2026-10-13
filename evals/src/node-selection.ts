export type SelectionMode = "standard" | "explicit-js" | "capability-gap" | "standard-recovery"

export type SelectionRuntime = { path: string; session: unknown; events: unknown[] }

export function inspectSelectionRecovery(input: { parts: unknown[]; runtime: SelectionRuntime[] }) {
  const calls = input.parts.flatMap((part, index) => readApply(part, input.parts).map((call) => ({ ...call, part, index })))
  const refused = calls.filter((call) => {
    const result = call.result
    if (call.nodeType !== "transform.calculator" || !record(result) || result.status !== "FAILED"
      || result.cleanup_complete !== true || !record(result.error) || result.error.code !== "NODE_APPLY_STOPPED"
      || !record(result.error.cause) || result.error.cause.code !== "WIZARD_CALCULATOR_VALIDATION_FAILED"
      || !call.node || !record(call.part)) return false
    const part = call.part
    const prepared = input.parts.slice(0, call.index).filter(record).filter((entry) => entry.sessionID === part.sessionID
      && entry.tool === "loginom_dock_prepare").map(receipt).filter(record).at(-1)
    return input.runtime.some((runtime) => record(runtime.session) && runtime.session.sessionId === prepared?.sessionId
      && runtime.events.some((event) => record(event) && event.session_id === prepared?.sessionId
        && event.operation_id === call.operationID && event.phase === "node_phase_refused" && record(event.receipt)
        && event.receipt.verification === "calculator_syntax_rejected_draft_restored"
        && event.receipt.status === "FAILED" && event.receipt.cleanup_complete === true && record(event.receipt.proof)
        && sameNode(event.receipt.proof.node, call.node)))
  })
  const corrected = refused.find((failed) => calls.some((call) => call.index > failed.index
    && call.nodeType === "transform.calculator" && call.succeeded && call.operationID !== failed.operationID
    && record(call.part) && record(failed.part) && call.part.sessionID === failed.part.sessionID && sameNode(call.node, failed.node)))
  return { recoveryObserved: refused.length > 0, recoveryCorrected: !!corrected,
    recoveryStatus: corrected ? "corrected" : refused.length ? "blocked" : "unobserved" }
}

function sameNode(left: unknown, right: unknown) {
  return record(left) && record(right) && ["document_id", "workflow_id", "node_id"].every((key) =>
    typeof left[key] === "string" && left[key] === right[key])
}

export function inspectSelectionJavaScriptIdentity(input: { parts: unknown[]; nodeIDs: unknown[]; exportNode: unknown }) {
  const output = record(input.exportNode) ? input.exportNode : undefined
  const calls = input.parts.flatMap((part) => readApply(part, input.parts))
    .filter((call) => call.nodeType === "programming.javascript" && call.succeeded)
  return input.nodeIDs.length === 1 && calls.length > 0 && !!output
    && calls.every((call) => call.node?.node_id === input.nodeIDs[0]
      && call.node?.document_id === output.document_id && call.node?.workflow_id === output.workflow_id)
}

export function inspectSelectionReview(input: { review: unknown; mode: SelectionMode; sessionID: unknown; packageSha256: unknown }) {
  if (input.mode === "standard" && input.review == null) return { reviewStatus: "not-required" }
  const value = input.review
  if (!record(value) || !["passed", "failed"].includes(String(value.verdict))
    || typeof value.reviewer !== "string" || !value.reviewer.trim() || typeof value.notes !== "string" || !value.notes.trim()
    || value.sessionID !== input.sessionID || typeof input.packageSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.packageSha256)
    || value.packageSha256 !== input.packageSha256 || !Array.isArray(value.evidence) || !value.evidence.length
    || value.evidence.some((file) => typeof file !== "string" || file.startsWith("/") || file.includes("\\")
      || file.split("/").some((part) => !part || part === "." || part === ".."))
    || (input.mode === "explicit-js" && value.javascriptRole !== "requested-aggregation")
    || (input.mode === "capability-gap" && value.javascriptRole !== "variable-unpack-only")
    || (input.mode === "standard-recovery" && value.recoveryObserved !== true)) return { reviewStatus: "pending" }
  return { reviewStatus: String(value.verdict) }
}

export function inspectSelectionProvenance(input: {
  snapshot: unknown; runtime: SelectionRuntime[]; model: unknown; variant: unknown; expectedSkillDigest: unknown
}) {
  const failures: string[] = []
  const snapshot = record(input.snapshot) ? input.snapshot : undefined
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages.filter(record).filter((message) => message.role === "assistant") : []
  if (!messages.length || typeof input.model !== "string" || typeof input.variant !== "string"
    || messages.some((message) => `${message.providerID}/${message.modelID}` !== input.model || message.variant !== input.variant))
    failures.push("MODEL_UNVERIFIED")
  const parts = Array.isArray(snapshot?.parts) ? snapshot.parts.filter(record) : []
  if (typeof input.expectedSkillDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedSkillDigest)
    || !parts.some((part) => part.tool === "skill" && record(part.state) && part.state.status === "completed"
      && record(part.state.input) && part.state.input.name === "loginom-automation" && record(part.state.metadata)
      && record(part.state.metadata.activation) && part.state.metadata.activation.name === "loginom-automation"
      && part.state.metadata.activation.profile === "loginom-automation"
      && part.state.metadata.activation.digest === input.expectedSkillDigest)) failures.push("SKILL_DIGEST_UNVERIFIED")
  const preparations = parts.filter((part) => part.tool === "loginom_dock_prepare").map(receipt).filter(record)
  if (!preparations.length || !input.runtime.length) failures.push("CATALOG_UNVERIFIED")
  for (const prepared of preparations) {
    const knowledge = record(prepared.knowledge) ? prepared.knowledge : undefined
    const manifest = record(knowledge?.session_manifest) ? knowledge.session_manifest : undefined
    const catalog = Array.isArray(knowledge?.node_types) ? knowledge.node_types.filter(record) : []
    if (prepared.prepared !== true || prepared.source !== "bundled" || prepared.skillRevision !== input.expectedSkillDigest
      || !manifest || !catalog.length || !catalog.some((node) => node.type === "programming.javascript")
      || !input.runtime.some((runtime) => {
        const session = record(runtime.session) ? runtime.session : undefined
        if (!session) return false
        return session.sessionId === prepared.sessionId && session.skillRevision === input.expectedSkillDigest
          && ["actionCatalogDigest", "selectorCatalogDigest", "actionManifestDigest"].every((key) =>
            typeof manifest[key] === "string" && /^[a-f0-9]{64}$/.test(manifest[key]) && session[key] === manifest[key])
          && ["capabilityAbi", "executorRevision", "actionCatalogVersion", "compatibilityProfile"].every((key) =>
            manifest[key] !== undefined && JSON.stringify(session[key]) === JSON.stringify(manifest[key]))
      })) failures.push("CATALOG_UNVERIFIED")
  }
  return { identityVerified: failures.length === 0, failures: [...new Set(failures)] }
}

export function inspectSelectionRuntime(input: { parts: unknown[]; runtime: SelectionRuntime[] }) {
  const failures: string[] = []
  const prepared = input.parts.filter(record).filter((part) => part.tool === "loginom_dock_prepare").map(receipt).filter(record)
  const owner: { dockID?: string } = {}
  const calls = input.parts.filter(record).filter((part) => typeof part.tool === "string" && part.tool.startsWith("loginom_")
    && record(part.state) && record(part.state.input)).map((part) => {
      const result = receipt(part)
      if (part.tool === "loginom_dock_prepare" && record(result) && result.prepared === true && typeof result.sessionId === "string")
        owner.dockID = result.sessionId
      return { part, result, dockID: owner.dockID }
    })
  if (!input.runtime.length) failures.push("RUNTIME_MISSING")
  for (const runtime of input.runtime) {
    const session = record(runtime.session) ? runtime.session : undefined
    const events = runtime.events.filter(record)
    if (!session || typeof session.sessionId !== "string" || events.length !== runtime.events.length
      || !events.length || events.some((event) => event.session_id !== session.sessionId)
      || !prepared.some((result) => result.prepared === true && result.sessionId === session.sessionId)) {
      failures.push("RUNTIME_IDENTITY_INVALID")
      continue
    }
    for (const opening of events.filter((event) => event.phase === "source_open_dispatch")) {
      if (!record(opening.owner) || !Number.isSafeInteger(opening.step)
        || !events.slice(events.indexOf(opening) + 1).some((event) => event.phase === "source_discard_settled"
          && event.step === opening.step && JSON.stringify(event.owner) === JSON.stringify(opening.owner)))
        failures.push("SOURCE_READ_UNSETTLED")
    }
    const admitted = events.filter((event) => ["prepared", "node_apply_prepared", "artifact_delivery_prepared"].includes(String(event.phase)))
    for (const admission of admitted) {
      if (typeof admission.operation_id !== "string") { failures.push("RUNTIME_OPERATION_INVALID"); continue }
      const terminals = events.filter((event) => event.operation_id === admission.operation_id
        && ["completed", "reconciled", "artifact_delivery_completed", "artifact_delivery_rejected", "artifact_delivery_not_applied"].includes(String(event.phase)))
      const last = terminals.at(-1)
      const outcome = record(last?.outcome) ? last.outcome : record(last?.result) ? last.result : undefined
      const submitted = record(outcome?.output) ? outcome.output : undefined
      // Native upload submission remains ambiguous until the owning delivery
      // verifies exactly those bytes. The public delivery result closes it.
      const verifiedUpload = admission.action_key === "artifact.upload" && outcome?.status === "AMBIGUOUS"
        && outcome.cleanup_complete === true && submitted && events.some((event) => {
          const result = record(event.result) ? event.result : undefined
          return event.phase === "artifact_delivery_completed" && result?.status === "SUCCEEDED"
            && result.cleanup_complete === true && result.upload_completion_verified === true
            && result.upload_operation_id === admission.operation_id
            && ["destination", "bytes", "sha256"].every((key) => result[key] === submitted[key])
        })
      if (!verifiedUpload && (!outcome || !["SUCCEEDED", "FAILED", "NOT_APPLIED"].includes(String(outcome.status))
        || outcome.cleanup_complete !== true || outcome.state === "running")) failures.push("RUNTIME_OPERATION_UNSETTLED")
      if (admission.phase !== "node_apply_prepared") continue
      const request = record(admission.request) ? admission.request : undefined
      const target = record(request?.target) ? request.target : undefined
      const publicApplies = calls.filter(({ part, dockID }) => dockID === session.sessionId && record(part.state) && record(part.state.input)
        && part.tool === "loginom_dock_node_apply" && part.state.input.operation_id === admission.operation_id)
      if (typeof target?.type !== "string" || !publicApplies.length || publicApplies.some(({ part }) => {
        const input = record(part.state) && record(part.state.input) ? part.state.input : undefined
        const publicTarget = record(input?.target) ? input.target : undefined
        return typeof request?.document_id !== "string" || request.document_id !== input?.document_id
          || !record(request.workflow_ref) || !record(input?.workflow_ref)
          || typeof request.workflow_ref.workflow_id !== "string" || request.workflow_ref.workflow_id !== input.workflow_ref.workflow_id
          || publicTarget?.type !== target.type || publicTarget?.kind !== target.kind
          || !["new", "existing"].includes(String(target.kind))
          || target.kind === "existing" && !sameNode(publicTarget?.ref, target.ref)
      })) failures.push("RUNTIME_APPLY_MISMATCH")
      const terminalNode = record(submitted?.node) ? submitted.node : record(outcome?.node) ? outcome.node : undefined
      const publicTerminalCall = calls.filter((call) => call.dockID === session.sessionId && record(call.result)
        && call.result.operation_id === admission.operation_id).at(-1)
      const publicTerminal = publicTerminalCall?.result
      if (outcome?.status === "SUCCEEDED" && !terminalNode || terminalNode && (terminalNode.document_id !== request?.document_id
        || !record(request?.workflow_ref) || terminalNode.workflow_id !== request.workflow_ref.workflow_id
        || target?.kind === "existing" && !sameNode(terminalNode, target.ref)
        || !record(publicTerminal) || !sameNode(terminalNode, publicTerminal.node)
        || publicTerminalCall?.part.tool === "loginom_dock_operation_inspect" && !sameNodeExecution(submitted, publicTerminal)))
        failures.push("RUNTIME_APPLY_MISMATCH")
    }
  }
  for (const [index, { part, result, dockID }] of calls.entries()) {
    if (!record(part.state) || !record(part.state.input)) continue
    if (!/^loginom_dock_(node_apply|node_wait|node_resume|node_read|artifact_deliver|action_run|operation_inspect)$/.test(String(part.tool))) continue
    if (record(result) && ["source", "context"].includes(String(result.kind))) {
      const owner = record(result.owner) ? result.owner : undefined
      const request = part.state.input
      const node = record(request.node) ? request.node : undefined
      const events = input.runtime.filter((runtime) => record(runtime.session) && runtime.session.sessionId === dockID)
        .flatMap((runtime) => runtime.events).filter(record).filter((event) => JSON.stringify(event.owner) === JSON.stringify(owner))
      if (!owner || owner.operation_id !== request.operation_id || !node
        || !["document_id", "workflow_id", "node_id"].every((key) => typeof owner[key] === "string" && owner[key] === node[key])
        || !Number.isSafeInteger(owner.ui_epoch) || !events.some((event) => event.phase === "source_discard_settled")
        || (result.kind === "source" ? !events.some((event) => event.phase === "source_delivery_verified"
          && record(event.receipt) && event.receipt.source_sha256 === result.source_sha256)
          : result.cleanup_complete !== true || !events.some((event) => event.phase === "javascript_context_delivery_verified"
            && event.semantic_sha256 === result.semantic_sha256))) failures.push("SOURCE_RECEIPT_UNVERIFIED")
      continue
    }
    const operationID = part.state.input.operation_id
    const sourceRead = calls.find((call) => call.dockID === dockID && call.part.sessionID === part.sessionID
      && call.part.tool === "loginom_dock_node_read" && record(call.part.state) && record(call.part.state.input)
      && ["source", "context"].includes(String(call.part.state.input.kind))
      && call.part.state.input.operation_id === operationID)
    if (sourceRead && record(sourceRead.part.state) && record(sourceRead.part.state.input)) {
      const request = sourceRead.part.state.input
      const terminal = calls.filter((call) => call.dockID === dockID && record(call.result)
        && (call.result.operation_id ?? (record(call.result.owner) ? call.result.owner.operation_id : undefined)) === request.operation_id).at(-1)?.result
      const progress = record(terminal) && record(terminal.progress) ? terminal.progress : undefined
      if (!record(terminal) || terminal.state !== "settled" || progress?.cleanup_complete !== true || progress.pending_phase !== null
        || JSON.stringify(progress.node) !== JSON.stringify(request.node)
        || !input.runtime.some((runtime) => record(runtime.session) && runtime.session.sessionId === dockID
          && runtime.events.some((event) => record(event) && record(event.owner) && event.owner.operation_id === request.operation_id
            && event.phase === "source_discard_settled"))) failures.push("SOURCE_READ_UNSETTLED")
      continue
    }
    if (part.state.status === "error" && record(result) && result.result_delivery === "refused"
      && record(result.error) && result.error.code === "USER_RESPONSE_BUDGET" && result.error.scope === "whole_response"
      && typeof operationID === "string" && result.original_operation_id === operationID
      && record(result.next_step) && result.next_step.tool === "dock_operation_inspect"
      && record(result.next_step.arguments) && result.next_step.arguments.operation_id === operationID
      && calls.slice(index + 1).some((call) => call.dockID === dockID && call.part.sessionID === part.sessionID
        && call.part.tool === "loginom_dock_operation_inspect" && record(call.result) && call.result.operation_id === operationID
        && input.runtime.some((runtime) => record(runtime.session) && runtime.session.sessionId === dockID
          && runtime.events.some((event) => record(event) && event.operation_id === operationID
            && ["completed", "reconciled"].includes(String(event.phase)) && record(event.outcome)
            && event.outcome.operation_id === operationID && event.outcome.status === "SUCCEEDED"
            && event.outcome.cleanup_complete === true && sameNodeExecution(event.outcome.output, call.result))))) continue
    if (!record(result) || typeof result.operation_id !== "string") { failures.push("TOOL_RECEIPT_INCOMPLETE"); continue }
    if (part.state.input.operation_id !== result.operation_id) failures.push("TOOL_OPERATION_MISMATCH")
    if (!(result.request_rejected === true && result.status === "NOT_APPLIED" && result.effect_possible === false)
      && !input.runtime.some((runtime) => record(runtime.session) && runtime.session.sessionId === dockID
        && runtime.events.some((event) => record(event) && event.operation_id === result.operation_id
          && ["prepared", "node_apply_prepared", "artifact_delivery_prepared"].includes(String(event.phase)))))
      failures.push("TOOL_ADMISSION_MISSING")
    const terminal = calls.filter((call) => call.dockID === dockID && call.part.sessionID === part.sessionID && record(call.result)
      && call.result.operation_id === result.operation_id).at(-1)?.result
    if (!record(terminal) || terminal.state === "running" || terminal.cleanup_complete !== true
      || !["SUCCEEDED", "FAILED", "NOT_APPLIED"].includes(String(terminal.status))) failures.push("TOOL_OPERATION_UNSETTLED")
  }
  return { runtimeSettled: failures.length === 0, failures: [...new Set(failures)] }
}

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
    if (!["snapshot", "patch", "text", "reasoning", "file", "agent", "compaction", "subtask", "retry", "step-start", "step-finish", "tool"]
      .includes(String(part.type))) failures.push("PART_TYPE_INVALID")
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
  runtime?: SelectionRuntime[]
}): { jsNodes: number | null; jsCalls: number; successfulJsCalls: number; failures: string[] } {
  const jsNodes = input.nodeTypes?.filter((type) =>
    ["TBGJavaScriptEngine", "TBGCodeModelComponentEngine"].includes(type)).length ?? null
  const calls = input.parts.flatMap((part) => readApply(part, input.parts))
  const javascript = calls.filter((call) => call.nodeType === "programming.javascript")
  const prepared = input.parts.filter(record).filter((part) => part.tool === "loginom_dock_prepare").map(receipt).filter(record)
  const unprojected = (input.runtime ?? []).flatMap((runtime) => {
    const session = record(runtime.session) ? runtime.session : undefined
    if (!session || !prepared.some((value) => value.prepared === true && value.sessionId === session.sessionId)) return []
    return runtime.events.filter(record).filter((event) => event.session_id === session.sessionId
      && event.phase === "node_apply_prepared" && record(event.request) && record(event.request.target)
      && event.request.target.type === "programming.javascript" && !javascript.some((call) => call.operationID === event.operation_id))
      .map((event) => `${session.sessionId}/${event.operation_id}`)
  })
  const jsCalls = javascript.length + new Set(unprojected).size
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
  const reference = record(target?.ref) ? target.ref : undefined
  const terminalPart = parts.filter(record).filter((candidate) => candidate.sessionID === part.sessionID
    && ["loginom_dock_node_apply", "loginom_dock_node_wait", "loginom_dock_node_resume", "loginom_dock_operation_inspect"].includes(String(candidate.tool))
    && record(candidate.state) && ["completed", "error"].includes(String(candidate.state.status)) && record(candidate.state.input)
    && candidate.state.input.operation_id === request?.operation_id).at(-1)
  const value = terminalPart ? receipt(terminalPart) : undefined
  const terminal = record(value) ? value : undefined
  const node = record(terminal?.node) ? terminal.node : undefined
  return [{
    node,
    result: terminal,
    operationID: request?.operation_id,
    nodeType: typeof target?.type === "string" ? target.type : undefined,
    succeeded: typeof part.id === "string" && typeof part.sessionID === "string" && typeof request?.operation_id === "string"
      && state?.status === "completed" && terminal?.operation_id === request.operation_id
      && (terminal?.state === "settled" || terminalPart?.tool === "loginom_dock_operation_inspect") && terminal?.status === "SUCCEEDED"
      && terminal.cleanup_complete === true && record(terminal.execution) && terminal.execution.status === "completed"
      && node?.document_id === request?.document_id && record(request?.workflow_ref)
      && node?.workflow_id === request.workflow_ref.workflow_id && typeof node?.node_id === "string"
      && (target?.kind === "new" || target?.kind === "existing" && reference
        && ["document_id", "workflow_id", "node_id"].every((key) => reference[key] === node[key])),
    failure: typeof target?.type !== "string" || !target.type.trim() ? "TOOL_INPUT_INCOMPLETE"
      : typeof part.id !== "string" || !state || !["pending", "running", "completed", "error"].includes(String(state.status))
        ? "TOOL_EVIDENCE_INVALID" : undefined,
  }]
}

export function readSelectionReceipt(part: unknown): unknown {
  if (!record(part)) return undefined
  if (!record(part.state)) return undefined
  if (record(part.state.metadata) && part.state.metadata.truncated === true) return undefined
  const value = part.state.status === "error" ? part.state.error : part.state.output
  if (typeof value !== "string") return inspectedNodeReceipt(part, value)
  try {
    const values: unknown[] = value.split(/\n\s*\n/).map((text) => JSON.parse(text) as unknown)
    const first = values[0]
    if (!record(first) || values.slice(1).some((extra) => !record(extra)
      || !["dock_saved_package_state", "dock_outcome_verification"].includes(String(extra.kind))
      || (extra.operation_id ?? extra.save_operation_id) !== first.operation_id)) return undefined
    return inspectedNodeReceipt(part, first)
  } catch { return undefined }
}

function inspectedNodeReceipt(part: Record<string, unknown>, value: unknown): unknown {
  if (part.tool !== "loginom_dock_operation_inspect") return value
  const input = record(part.state) && record(part.state.input) ? part.state.input : undefined
  const output = record(value) && record(value.output) ? value.output : undefined
  const outcome = record(output?.outcome) ? output.outcome : undefined
  const node = record(outcome?.output) ? outcome.output : undefined
  const reference = record(node?.node) ? node.node : undefined
  if (!record(part.state) || part.state.status !== "completed" || !record(value)
    || value.status !== "SUCCEEDED" || value.action_key !== "operation.inspect" || value.effect_possible !== false || value.error !== null
    || typeof input?.operation_id !== "string" || value.operation_id !== input.operation_id
    || output?.operation_id !== input.operation_id || output.state !== "resolved"
    || output.cleanup_confirmed !== true || output.effect_state !== "verified"
    || outcome?.action_key !== "node.apply" || outcome.operation_id !== input.operation_id || outcome.status !== "SUCCEEDED"
    || outcome.cleanup_complete !== true || outcome.error !== null || node?.operation_id !== input.operation_id
    || node.status !== "SUCCEEDED" || node.cleanup_complete !== true || !reference
    || !["document_id", "workflow_id", "node_id"].every((key) => typeof reference[key] === "string" && reference[key])
    || !record(node.execution) || node.execution.status !== "completed" || typeof node.execution.execution_id !== "string"
    || !node.execution.execution_id) return undefined
  // Inspection retains the original node outcome; its resolved state is verified above, not invented on the inner receipt.
  return { ...outcome, ...node, output: node.output }
}

function sameNodeExecution(left: unknown, right: unknown) {
  return record(left) && record(right) && sameNode(left.node, right.node)
    && record(left.execution) && record(right.execution) && left.execution.status === "completed"
    && right.execution.status === "completed" && typeof left.execution.execution_id === "string"
    && left.execution.execution_id === right.execution.execution_id
}

function receipt(part: Record<string, unknown>): unknown { return readSelectionReceipt(part) }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
