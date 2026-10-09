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

test("oracle activates automation through skill before recording the Dock contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-provider-test-"))
  const provider = oracleProvider({ directory, apiKey: "private-acceptance-key" })
  const request = (messages: unknown[], names: string[]) =>
    fetch(provider.config.provider.test.options.baseURL + "/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages,
        tools: names.map((name) => ({ type: "function", function: { name, parameters: { type: "object" } } })),
      }),
    })
  const toolCall = async (response: Response) => {
    expect(response.status).toBe(200)
    return JSON.parse((await response.text()).split("\n")[0].slice(6)).choices[0].delta.tool_calls[0]
  }
  try {
    const activation = provider
      .request("call", { name: "skill", arguments: { name: "loginom-automation" } })
      .catch((error) => ({ error: error.message }))
    const skill = await toolCall(await request([{ role: "system", content: "default scope" }], ["skill"]))
    expect(skill.function.name).toBe("skill")
    expect(JSON.parse(skill.function.arguments)).toEqual({ name: "loginom-automation" })
    expect(await Bun.file(join(directory, "model-contract.json")).exists()).toBe(false)
    const next = request(
      [
        { role: "system", content: "automation scope" },
        {
          role: "tool",
          tool_call_id: skill.id,
          content: '<skill_content name="loginom-automation">\n\nBuild instructions\n</skill_content>',
        },
      ],
      ["skill", "loginom_dock_prepare"],
    )
    expect(await activation).toEqual({
      result: { content: [{ type: "text", text: '<skill_content name="loginom-automation">' }] },
    })
    const prepared = provider
      .request("call", { name: "dock_prepare", arguments: { intent: "new_draft" } })
      .catch((error) => ({ error: error.message }))
    const prepare = await toolCall(await next)
    expect(prepare.function.name).toBe("loginom_dock_prepare")
    const done = request(
      [{ role: "tool", tool_call_id: prepare.id, content: '{"prepared":true}' }],
      ["loginom_dock_prepare"],
    )
    expect(await prepared).toEqual({ result: { content: [{ type: "text", text: '{"prepared":true}' }] } })
    provider.finish()
    await (await done).text()
    const contract = JSON.parse(await readFile(join(directory, "model-contract.json"), "utf8"))
    expect(contract.system).toEqual([{ role: "system", content: "automation scope" }])
    expect(contract.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual([
      "loginom_dock_prepare",
    ])
  } finally {
    provider.exited()
    provider.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
