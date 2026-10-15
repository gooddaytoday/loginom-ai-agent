import { expect, test } from "bun:test"
import { loginomReplayProvider } from "./helpers/loginom-replay-provider"

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
