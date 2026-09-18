import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { oracleProvider } from "../script/oracle-provider"

test("scripted oracle exchanges actual HTTP tool calls and records the advertised contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-provider-test-"))
  const finished: string[] = []
  const provider = oracleProvider({
    directory,
    apiKey: "private-acceptance-key",
    onFinish: () => finished.push("finish"),
  })
  const request = (messages: unknown[]) =>
    fetch(provider.config.provider.test.options.baseURL + "/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages,
        tools: [{ type: "function", function: { name: "loginom_dock_prepare", parameters: { type: "object" } } }],
      }),
    })
  try {
    const result = provider.request("call", { name: "dock_prepare", arguments: { operation_id: "prepare-A" } })
    const response = await request([
      { role: "system", content: "Loginom instructions" },
      { role: "tool", tool_call_id: "oracle_1", content: '{"prepared":"historical"}' },
    ])
    const chunk = JSON.parse((await response.text()).split("\n")[0].slice(6))
    const call = chunk.choices[0].delta.tool_calls[0]
    expect(call.id).not.toBe("oracle_1")
    expect(call.function.name).toBe("loginom_dock_prepare")
    expect(JSON.parse(call.function.arguments)).toEqual({ operation_id: "prepare-A" })
    const next = request([{ role: "tool", tool_call_id: call.id, content: '{"prepared":true}\n\nextra guidance' }])
    expect(await result).toEqual({ result: { content: [{ type: "text", text: '{"prepared":true}' }] } })
    provider.finish()
    expect(await (await next).text()).toContain("CLI oracle completed")
    expect(finished).toEqual(["finish"])
    const contract = JSON.parse(await readFile(join(directory, "model-contract.json"), "utf8"))
    expect(contract.system).toEqual([{ role: "system", content: "Loginom instructions" }])
    expect(contract.tools[0].function.parameters).toEqual({ type: "object" })
  } finally {
    provider.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test("interface exit rejects outstanding oracle work and prevents another dispatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-provider-test-"))
  const provider = oracleProvider({ directory, apiKey: "private-acceptance-key" })
  try {
    const result = provider.request("call", { name: "dock_prepare", arguments: {} }).catch((error) => error.message)
    provider.exited()
    expect(await result).toBe("CLI_ORACLE_EXITED")
    await expect(provider.request("call", { name: "dock_prepare", arguments: {} })).rejects.toThrow(
      "CLI_ORACLE_NOT_AVAILABLE",
    )
  } finally {
    provider.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
