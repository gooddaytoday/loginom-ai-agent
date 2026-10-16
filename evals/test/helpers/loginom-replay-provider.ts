// Deterministic local provider for native CLI research; it never calls a model.
export function loginomReplayProvider(mode: "prepare" | "text" | "active" = "prepare") {
  const requests: { model: string | null; tools: string[]; activation: boolean; preparation: boolean; toolReply: boolean; preparedReply: boolean }[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/chat/completions") return new Response(null, { status: 404 })
    const body = await request.json() as { model?: string; tools?: { function: { name: string } }[];
      messages: { role: string; tool_call_id?: string; content?: string }[] }
    const tools = body.tools?.map(tool => tool.function.name) ?? []
    const toolReply = body.messages.some(message => message.role === "tool" && message.tool_call_id === "native-activation")
    const preparedReply = body.messages.some(message => message.role === "tool" && message.tool_call_id === "native-preparation")
    const activation = mode !== "text" && tools.includes("skill") && !toolReply
    const preparation = mode !== "text" && tools.includes("loginom_dock_prepare") && toolReply && !preparedReply
    requests.push({ model: body.model ?? null, tools, activation, preparation, toolReply, preparedReply })
    const prepared = mode === "active" && preparedReply ? JSON.parse(body.messages.find(message => message.tool_call_id === "native-preparation")!.content!) as {
      prepared: boolean; workspace: { document_id: string; workflow_ref: { workflow_id: string } } } : null
    const described = body.messages.some(message => message.role === "tool" && message.tool_call_id === "native-description")
    const executed = body.messages.some(message => message.role === "tool" && message.tool_call_id === "native-execution")
    const last = body.messages.findLast(message => message.role === "tool" &&
      (message.tool_call_id === "native-execution" || message.tool_call_id?.startsWith("native-wait-")))
    const running = last?.content ? (JSON.parse(last.content) as { state?: string }).state === "running" : false
    const call = activation ? { id: "native-activation", name: "skill", args: { name: "loginom-automation" } }
      : preparation ? { id: "native-preparation", name: "loginom_dock_prepare", args: mode === "active"
        ? { intent: "open_package", package_path: "/eval-a/interrupt-probe.lgp", timeout_ms: 30_000 }
        : { intent: "new_draft", timeout_ms: 30_000 } }
      : prepared?.prepared && !described ? { id: "native-description", name: "loginom_dock_action_describe", args: { node_types: ["transform.calculator"] } }
      : prepared?.prepared && !executed ? { id: "native-execution", name: "loginom_dock_node_apply", args: {
        operation_id: "native-execution", contract_revision: "1.0.0", document_id: prepared.workspace.document_id,
        workflow_ref: { workflow_id: prepared.workspace.workflow_ref.workflow_id },
        target: { kind: "existing", type: "transform.calculator", ref: { document_id: prepared.workspace.document_id,
          workflow_id: prepared.workspace.workflow_ref.workflow_id, node_id: "d9b8ef8e-7705-4c4e-a5f0-4ec1c7b45a97" } },
        // This GUID belongs to the pinned local LGP fixture; the runtime rebinds it in the prepared graph.
        inputs: [], mode: "expression", finish: "execute", parameters: { expressions: [] } } }
      : prepared?.prepared && executed && running ? { id: `native-wait-${requests.length}`, name: "loginom_dock_node_wait", args: { operation_id: "native-execution", timeout_ms: 1000 } }
      : null
    const delta = call ? { tool_calls: [{ index: 0, id: call.id, type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.args) } }] }
      : { content: "Native replay complete" }
    return new Response([
      { choices: [{ index: 0, delta, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: call ? "tool_calls" : "stop" }] },
    ].map(chunk => `data: ${JSON.stringify({ id: "native-replay", object: "chat.completion.chunk", ...chunk })}\n\n`).join("") + "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } })
  } })
  return { server, requests }
}
