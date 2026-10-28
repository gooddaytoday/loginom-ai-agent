import { expect, test } from "bun:test"
import { Uint8ArrayReader, TextWriter, ZipReader } from "@zip.js/zip.js"
import { createHash } from "node:crypto"
import { cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { connectionStore } from "@loginom-ai-agent/loginom-host/connection/connection-store"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { knowledgeServer } from "../../../loginom-runtime/client/test/support/knowledge-server.mjs"
import { pdfText } from "../../../loginom-host/test/package-docs-pdf"
import { standaloneFixture, invoke } from "../fixture/standalone"
import { testProviderConfig } from "../lib/test-provider"

type Request = {
  tools?: { function: { name: string } }[]
  messages: { role: string; tool_call_id?: string; content?: string }[]
}

test.each(["pdf", "docx", "md"] as const)(
  "standalone publishes a filled %s report through Help without browser runtime",
  async (format) => {
    await using fixture = await standaloneFixture(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)
    const input = join(fixture.directory, "Исходный сценарий.LGP")
    const fixtures = resolve(import.meta.dir, "../../../loginom-host/test/fixtures/package-docs")
    await cp(join(fixtures, "nested.lgp"), input)
    const original = createHash("sha256")
      .update(await readFile(input))
      .digest("hex")
    const cleanup: (() => void | Promise<void>)[] = []
    const help = "viking://resources/loginom-dock/sources/loginom-help"
    const procedure = help + "/data/processors/transformation/calc/README.md"
    const knowledge = await knowledgeServer(
      { after: (callback) => cleanup.push(callback) },
      {
        call: async (params: { name: string }) => ({
          content: [
            {
              type: "text",
              text: params.name === "find" ? procedure : "Калькулятор вычисляет значения полей по формулам.",
            },
          ],
        }),
      },
    )
    const requests: Request[] = []
    const actions: { name: string; arguments: Record<string, unknown> }[] = []
    const provider = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const body: Request = await request.json()
        const output = (id: number) => {
          const result = body.messages.find(
            (message) => message.role === "tool" && message.tool_call_id === `step-${id}`,
          )
          if (typeof result?.content !== "string") throw Error(`Missing tool response step-${id}`)
          return result.content
        }
        const action = (() => {
          if (!body.tools?.length) return
          requests.push(body)
          const step = actions.length
          if (step === 0) return { name: "skill", arguments: { name: "package-docs" } }
          if (step === 1) return { name: "package_docs_run", arguments: { operation: "extract", lgp: input } }
          if (step === 2) return { name: "read", arguments: { filePath: JSON.parse(output(1)).structure } }
          if (step === 3) {
            expect(output(2)).toContain("TBGCalcData")
            return { name: "package_docs_run", arguments: { operation: "skeleton", lgp: input } }
          }
          if (step === 4) return { name: "loginom_find", arguments: { uri: help } }
          if (step === 5) return { name: "loginom_read", arguments: { uri: procedure } }
          if (step === 6) return { name: "read", arguments: { filePath: JSON.parse(output(3)).report } }
          if (step === 7) {
            expect(output(5)).toContain("Калькулятор вычисляет значения полей по формулам.")
            const draft = output(6)
              .split("\n")
              .filter((line) => /^\d+: /.test(line))
              .map((line) => line.replace(/^\d+: /, ""))
              .join("\n")
            expect(draft).toContain("PLACEHOLDER_PACKAGE_DESCRIPTION")
            const content = draft.replace(
              /PLACEHOLDER_[A-Z_0-9]+/g,
              "Калькулятор рассчитывает новые поля исходных данных. Общая структура: импорт → расчёт → вложенная обработка. Описание подмоделей: данные проходят два уровня вложенности.",
            )
            return { name: "write", arguments: { filePath: JSON.parse(output(3)).report, content } }
          }
          if (step === 8) return { name: "package_docs_run", arguments: { operation: "emit", lgp: input, format } }
        })()
        const delta = action
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: `step-${actions.length}`,
                  type: "function",
                  function: { name: action.name, arguments: JSON.stringify(action.arguments) },
                },
              ],
            }
          : { content: body.tools?.length ? `Отчёт создан: ${JSON.parse(output(8)).output}` : "Документация пакета" }
        if (action) actions.push(action)
        const chunks = [
          { choices: [{ index: 0, delta, finish_reason: null }] },
          { choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }] },
        ]
        return new Response(
          chunks
            .map(
              (chunk) =>
                `data: ${JSON.stringify({ id: "docs-pipeline", object: "chat.completion.chunk", ...chunk })}\n\n`,
            )
            .join("") + "data: [DONE]\n\n",
          {
            headers: { "content-type": "text/event-stream" },
          },
        )
      },
    })
    try {
      if (!fixture.binary) {
        await mkdir(join(fixture.bundle, "runtime/src"), { recursive: true })
        await symlink(
          resolve(import.meta.dir, "../../../loginom-runtime/src/knowledge-entry.mjs"),
          join(fixture.bundle, "runtime/src/knowledge-entry.mjs"),
        )
      }
      const manifest = JSON.parse(await readFile(join(fixture.bundle, "resource-manifest.json"), "utf8"))
      await writeFile(
        join(fixture.bundle, "resource-manifest.json"),
        JSON.stringify({ ...manifest, endpoint: knowledge.endpoint }),
      )
      const connection = connectionStore(join(fixture.profile, "loginom/connection"), cliCredentials("linux"))
      await connection.stage({
        generation: 1,
        revision: 1,
        apiKey: "UNIT-NONSECRET",
        password: "PRIVATE-NONSECRET",
        username: "user",
        url: "http://127.0.0.1:1/app/",
      })
      await connection.activate(1)
      await writeFile(
        join(fixture.profile, "config/loginom-ai-agent.json"),
        JSON.stringify({
          ...testProviderConfig(`http://127.0.0.1:${provider.port}/v1`),
          permission: { read: "allow", edit: "allow", skill: "allow" },
        }),
      )
      const result = await invoke(
        fixture,
        ["--file", input, "--", `Напиши ${format} документацию приложенного сценария.`],
        undefined,
        { PATH: "/nonexistent" },
      )
      expect(result.exit).toBe(0)
      expect(result.events.filter((event) => event.type === "error")).toEqual([])
      expect(
        result.events
          .filter((event) => event.type === "tool_use")
          .every((event) => event.part.state.status === "completed"),
      ).toBe(true)
      expect(actions.map((action) => action.name)).toEqual([
        "skill",
        "package_docs_run",
        "read",
        "package_docs_run",
        "loginom_find",
        "loginom_read",
        "read",
        "write",
        "package_docs_run",
      ])
      expect(
        requests
          .slice(1)
          .every(
            (request) =>
              !request.tools?.some((tool) => ["task", "bash", "loginom_dock_prepare"].includes(tool.function.name)),
          ),
      ).toBe(true)
      expect(knowledge.calls.map((call: { name: string }) => call.name)).toEqual(["find", "read"])
      const expected = join(fixture.directory, `Исходный сценарий.lgp_report.${format}`)
      expect(result.events.some((event) => event.type === "text" && event.part.text.includes(expected))).toBe(true)
      const bytes = await readFile(expected)
      const text = await (async () => {
        if (format === "pdf") {
          expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
          return pdfText(bytes).join("\n")
        }
        if (format === "md") return bytes.toString("utf8")
        expect(bytes.subarray(0, 2).toString()).toBe("PK")
        const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), { useWebWorkers: false })
        try {
          const document = (await zip.getEntries()).find((entry) => entry.filename === "word/document.xml")
          expect(document?.directory).toBe(false)
          if (!document || document.directory) throw Error("DOCX document is missing")
          return await document.getData!(new TextWriter())
        } finally {
          await zip.close()
        }
      })()
      expect(text).toContain("Общее количество узлов")
      expect(text).toContain("Общее количество подмоделей")
      expect(text).toContain("Калькулятор")
      expect(text).not.toContain("PLACEHOLDER_")
      const extract = result.events.find(
        (event) =>
          event.type === "tool_use" &&
          event.part.tool === "package_docs_run" &&
          event.part.state.input.operation === "extract",
      )
      const structure = JSON.parse(extract.part.state.output).structure
      const expectedStructure = await Bun.file(join(fixtures, "nested.structure.json")).json()
      expectedStructure.package.file_name = "Исходный сценарий.LGP"
      expect(await Bun.file(structure).json()).toEqual(expectedStructure)
      expect(
        createHash("sha256")
          .update(await readFile(input))
          .digest("hex"),
      ).toBe(original)
      expect(await readdir(fixture.profile)).not.toContain(".writer")
      expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
      if (process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS) {
        const artifacts = join(process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS, format)
        await mkdir(artifacts, { mode: 0o700 })
        await cp(expected, join(artifacts, `report.${format}`))
        await cp(structure, join(artifacts, "structure.json"))
        await cp(join(dirname(structure), "report.md"), join(artifacts, "report.md"))
        await writeFile(
          join(artifacts, "evidence.json"),
          JSON.stringify(
            {
              binary: fixture.binary,
              bundle: fixture.bundle,
              inputSha256: original,
              actions,
              requests,
              knowledge: knowledge.calls,
              result,
            },
            null,
            2,
          ),
        )
      }
    } finally {
      provider.stop(true)
      for (const callback of cleanup) await callback()
    }
  },
  30_000,
)
