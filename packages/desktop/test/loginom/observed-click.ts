type Observation = {
  observation_id: string
  observation_kind?: string
  origin?: string
  authenticated?: boolean
  loginom_build?: string
  dom_epoch?: { document?: string }
  workflow_ref?: { tab_tid?: string; prefix?: string }
  package_identity?: { path?: string | null } | null
  ui: { elements: { tid?: string; ref: string; allowed_actions?: string[] }[] }
  page?: { next_cursor?: string | null }
}
type Reply = {
  action_key?: string
  status?: string
  phase?: string
  operation_id?: string | null
  effect_possible?: boolean
  cleanup_complete?: boolean
  error?: { code?: string } | null
  output: Observation
}

// Acceptance helper: a pre-dispatch refusal permits a fresh observation, never
// replay of an uncertain gesture. The exact package/workflow/document must survive.
// dock_ui_action exists only in the diagnostic profile; the managed user-v1 runtime
// does not publish it, so runtime-acceptance.ts closes packages via shutdown cleanup.
export async function clickObserved(
  call: (name: string, args: Record<string, unknown>) => Promise<Reply>,
  tid: string,
  operation: string,
) {
  const roots: { root_ref: string; observation_id: string }[] = []
  let observation = await call("dock_workspace_observe", { scope: "all" })
  let refreshes = 0
  for (let page = 0; page < 40; page++) {
    if (observation.status !== "SUCCEEDED") {
      observation = await call("dock_workspace_observe", { scope: "all" })
      continue
    }
    const output = observation.output
    const element = output.ui.elements.find((item) => item.tid === tid && item.allowed_actions?.includes("click"))
    if (element) {
      const id = refreshes ? `${operation}-refresh-${refreshes}` : operation
      const clicked = await call("dock_ui_action", {
        observation_id: output.observation_id,
        operation_id: id,
        action: { verb: "click", ref: element.ref },
      })
      if (clicked.status === "SUCCEEDED") return
      if (
        refreshes >= 2 ||
        clicked.action_key !== "ui.act" ||
        clicked.operation_id !== id ||
        clicked.status !== "NOT_APPLIED" ||
        clicked.phase !== "preconditions" ||
        clicked.effect_possible !== false ||
        clicked.cleanup_complete !== true ||
        clicked.error?.code !== "UI_EPOCH_CHANGED"
      )
        throw Error("PACKAGE_CLOSE_GESTURE_FAILED")
      const before = identity(output)
      observation = await call("dock_workspace_observe", { scope: "all" })
      if (observation.status !== "SUCCEEDED" || identity(observation.output) !== before)
        throw Error("PACKAGE_CLOSE_CONTEXT_CHANGED")
      roots.length = 0
      refreshes++
      continue
    }
    for (const element of output.ui.elements) {
      if (output.observation_kind === "roots" && element.tid && tid.startsWith(element.tid + ";"))
        roots.push({ root_ref: element.ref, observation_id: output.observation_id })
    }
    const ancestor = roots.shift()
    if (ancestor) {
      observation = await call("dock_workspace_observe", ancestor)
      continue
    }
    if (output.page?.next_cursor) {
      observation = await call("dock_workspace_observe", { cursor: output.page.next_cursor })
      continue
    }
    break
  }
  throw Error(`PACKAGE_CONTROL_NOT_OBSERVED_${tid}`)
}

function identity(output: Observation) {
  if (
    !output.origin ||
    output.authenticated !== true ||
    !output.loginom_build ||
    !output.dom_epoch?.document ||
    !output.workflow_ref?.tab_tid ||
    !output.workflow_ref.prefix
  )
    throw Error("PACKAGE_CLOSE_CONTEXT_UNVERIFIED")
  return JSON.stringify([
    output.origin,
    output.authenticated,
    output.loginom_build,
    output.dom_epoch.document,
    output.workflow_ref.tab_tid,
    output.workflow_ref.prefix,
    output.package_identity?.path ?? null,
  ])
}
