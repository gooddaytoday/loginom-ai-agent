// Deterministic local provider for native CLI research; it never calls a model.
export function loginomReplayProvider(mode: "prepare" | "text" = "prepare") {
  const requests: { model: string | null; tools: string[]; activation: boolean; preparation: boolean; toolReply: boolean; preparedReply: boolean }[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/chat/completions") return new Response(null, { status: 404 })
    const body = await request.json() as { model?: string; tools?: { function: { name: string } }[];
      messages: { role: string; tool_call_id?: string }[] }
    const tools = body.tools?.map(tool => tool.function.name) ?? []
    const toolReply = body.messages.some(message => message.role === "tool" && message.tool_call_id === "native-activation")
    const preparedReply = body.messages.some(message => message.role === "tool" && message.tool_call_id === "native-preparation")
    const activation = mode === "prepare" && tools.includes("skill") && !toolReply
    const preparation = mode === "prepare" && tools.includes("loginom_dock_prepare") && toolReply && !preparedReply
    requests.push({ model: body.model ?? null, tools, activation, preparation, toolReply, preparedReply })
    const delta = activation || preparation ? { tool_calls: [{ index: 0, id: activation ? "native-activation" : "native-preparation", type: "function",
      function: { name: activation ? "skill" : "loginom_dock_prepare",
        arguments: JSON.stringify(activation ? { name: "loginom-automation" } : { intent: "new_draft", timeout_ms: 30_000 }) } }] }
      : { content: "Native replay complete" }
    return new Response([
      { choices: [{ index: 0, delta, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: activation || preparation ? "tool_calls" : "stop" }] },
    ].map(chunk => `data: ${JSON.stringify({ id: "native-replay", object: "chat.completion.chunk", ...chunk })}\n\n`).join("") + "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } })
  } })
  return { server, requests }
}
