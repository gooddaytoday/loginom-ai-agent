import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { standaloneFixture, invoke } from "../fixture/standalone"
import { testProviderConfig } from "../lib/test-provider"

type Request = {
  tools?: { function: { name: string } }[]
  messages: { role: string; tool_call_id?: string; content?: string }[]
}

test.each(["text-path", "plan"] as const)(
  "standalone preserves %s documentation permissions",
  async (kind) => {
    await using fixture = await standaloneFixture(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)
    const input = join(fixture.directory, "Исходный сценарий.LGP")
    await cp(resolve(import.meta.dir, "../../../loginom-host/test/fixtures/package-docs/demo.lgp"), input)
    const original = createHash("sha256")
      .update(await readFile(input))
      .digest("hex")
    const requests: Request[] = []
    const provider = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const body: Request = await request.json()
        const activated = body.messages.some((message) => message.tool_call_id === "activate")
        const extracted = body.messages.some((message) => message.tool_call_id === "extract")
        const action =
          !body.tools?.length || extracted
            ? undefined
            : activated
              ? { id: "extract", name: "package_docs_run", args: { operation: "extract", lgp: input } }
              : { id: "activate", name: "skill", args: { name: "package-docs" } }
        if (body.tools?.length) requests.push(body)
        if (action) expect(body.tools?.some((tool) => tool.function.name === action.name)).toBe(true)
        const delta = action
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: action.id,
                  type: "function",
                  function: { name: action.name, arguments: JSON.stringify(action.args) },
                },
              ],
            }
          : { content: "Проверка чтения" }
        return new Response(
          [
            { choices: [{ index: 0, delta, finish_reason: null }] },
            { choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }] },
          ]
            .map(
              (chunk) =>
                `data: ${JSON.stringify({ id: "docs-permissions", object: "chat.completion.chunk", ...chunk })}\n\n`,
            )
            .join("") + "data: [DONE]\n\n",
          { headers: { "content-type": "text/event-stream" } },
        )
      },
    })
    try {
      await writeFile(
        join(fixture.profile, "config/loginom-ai-agent.json"),
        JSON.stringify({
          ...testProviderConfig(`http://127.0.0.1:${provider.port}/v1`),
          permission: {
            skill: "allow",
            read: "ask",
            external_directory: "ask",
            // Preserve plan's edit policy; an explicit global allow overrides ordinary agent defaults.
            ...(kind === "plan" ? {} : { edit: "allow" }),
          },
        }),
      )
      const result = await invoke(
        fixture,
        [
          ...(kind === "plan" ? ["--agent", "plan", "--file", input] : []),
          "--",
          `Напиши документацию по локальному пакету ${input}.`,
        ],
        undefined,
        {
          PATH: "/nonexistent",
        },
      )
      expect(result.exit).toBe(1)
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: "error",
          error: { name: "CLI_PERMISSION_REJECTED", data: { message: "CLI_PERMISSION_REJECTED" } },
        }),
      )
      const extract = result.events.find((event) => event.type === "tool_use" && event.part.tool === "package_docs_run")
      expect(extract?.part.state.status).toBe("error")
      expect(extract?.part.state.metadata?.permissionDenied).toBe(true)
      expect(extract?.part.state.error).toContain(kind === "plan" ? '"permission":"edit"' : "--file")
      // Automatic CLI rejection stops the loop; a configured deny is returned to the model.
      expect(requests).toHaveLength(kind === "plan" ? 3 : 2)
      expect(await readdir(fixture.directory)).not.toContain(".work")
      expect(await readdir(fixture.profile)).not.toContain(".writer")
      expect(
        createHash("sha256")
          .update(await readFile(input))
          .digest("hex"),
      ).toBe(original)
      if (process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS) {
        const evidence = join(process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS, kind)
        await mkdir(evidence, { mode: 0o700 })
        await writeFile(
          join(evidence, "evidence.json"),
          JSON.stringify({ binary: fixture.binary, originalSha256: original, result, requests }, null, 2),
        )
      }
    } finally {
      provider.stop(true)
    }
  },
  30_000,
)
