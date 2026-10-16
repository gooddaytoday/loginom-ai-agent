import { expect, test } from "bun:test"
import { loginomReplayProvider } from "./helpers/loginom-replay-provider"

test("text replay finishes without activating browser tools", async () => {
  const provider = loginomReplayProvider("text")
  try {
    const response = await fetch(new URL("chat/completions", provider.server.url), { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "replay",
        messages: [{ role: "user", content: "Return Native replay complete" }], tools: [{ function: { name: "skill" } }] }) })
    const output = await response.text()
    expect(output).toContain('"content":"Native replay complete"')
    expect(output).not.toContain("tool_calls")
    expect(provider.requests).toMatchObject([{ activation: false, preparation: false }])
  } finally { provider.server.stop(true) }
})

test("native replay provider activates Loginom once and ends after the real tool reply", async () => {
  const provider = loginomReplayProvider()
  const request = async (messages: { role: string; tool_call_id?: string; content: string }[], tools?: { function: { name: string } }[]) => {
    const response = await fetch(new URL("chat/completions", provider.server.url), {
      method: "POST", body: JSON.stringify({ model: "replay", messages, tools }), headers: { "content-type": "application/json" },
    })
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    return response.text()
  }
  try {
    expect((await fetch(new URL("json/version", provider.server.url))).status).toBe(404)
    expect(await request([{ role: "user", content: "Generate a title" }])).not.toContain("tool_calls")
    expect(await request([{ role: "user", content: "Native replay" }], [{ function: { name: "skill" } }]))
      .toContain('"function":{"name":"skill","arguments":"{\\"name\\":\\"loginom-automation\\"}"}')
    expect(await request([{ role: "tool", tool_call_id: "native-activation", content: "Loaded skill" }], [{ function: { name: "loginom_dock_prepare" } }]))
      .toContain('"name":"loginom_dock_prepare"')
    expect(await request([{ role: "tool", tool_call_id: "native-activation", content: "Loaded skill" },
      { role: "tool", tool_call_id: "native-preparation", content: "Prepared workspace" }], [{ function: { name: "loginom_dock_prepare" } }]))
      .toContain('"content":"Native replay complete"')
    expect(provider.requests.map(row => row.activation)).toEqual([false, true, false, false])
    expect(provider.requests.map(row => row.preparation)).toEqual([false, false, true, false])
    expect(provider.requests.every(row => row.model === "replay")).toBe(true)
    expect(JSON.stringify(provider.requests)).not.toContain("Loaded skill")
  } finally { provider.server.stop(true) }
})

test("native replay provider stops waiting after a terminal node refusal", async () => {
  const provider = loginomReplayProvider("active")
  try {
    const response = await fetch(new URL("chat/completions", provider.server.url), { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "replay", tools: [{ function: { name: "loginom_dock_node_wait" } }], messages: [
        { role: "tool", tool_call_id: "native-activation", content: "skill activated" },
        { role: "tool", tool_call_id: "native-preparation", content: JSON.stringify({ prepared: true,
          workspace: { document_id: "document", workflow_ref: { workflow_id: "workflow" } } }) },
        { role: "tool", tool_call_id: "native-description", content: "calculator contract" },
        { role: "tool", tool_call_id: "native-execution", content: JSON.stringify({ state: "running" }) },
        { role: "tool", tool_call_id: "native-wait-1", content: JSON.stringify({ state: "settled", status: "NOT_APPLIED",
          error: { code: "NODE_APPLY_STOPPED", message: "calculator preflight requires an active source output" } }) },
      ] }) })
    expect(response.status).toBe(200)
    const stream = await response.text()
    expect(stream).toContain('"content":"Native replay complete"')
    expect(stream).toContain('"finish_reason":"stop"')
    expect(stream).not.toContain('"tool_calls"')
  } finally { provider.server.stop(true) }
})
