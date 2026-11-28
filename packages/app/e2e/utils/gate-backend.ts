import { copyFile, cp, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { scriptedModel, type Step } from "../../../cli/test/fixture/product-run"
import { buildPackageDocs } from "../../../loginom-host/script/build-package-docs"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"
import { ServiceHost } from "../../../loginom-agent/src/host"
import { ServerProcess } from "../../../server/src/process"
import { dockTool, scriptedHost } from "../../../server/test/fixture/loginom-dock-host"
import { gateScenarios, gateModelID, gatePassword, gateToolReplies } from "./gate-scenarios"

const [root, id] = process.argv.slice(2)
if (!root || !process.send || (id !== "first" && id !== "documentation" && id !== "instructions")) {
  throw Error("Expected a gate profile and scenario")
}
const disconnected = Promise.withResolvers<void>()
process.once("disconnect", disconnected.resolve)
const scenario = gateScenarios[id]
const directory = path.join(root, "work")
const resources = path.join(root, "resources")
const packages = path.resolve(import.meta.dir, "../../..")
await mkdir(directory)
const documentation = id === "documentation"
if (id !== "first") {
  await cp(path.join(packages, "product/skills"), path.join(resources, "skills"), { recursive: true })
  // Installed skill verification checks the whole bundle, including the generated docs executor.
  await buildPackageDocs(path.join(resources, "skills/package-docs/scripts"))
}
if (documentation) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to Node 24.19.0")
  await mkdir(path.join(resources, "bin"))
  await copyFile(node, path.join(resources, "bin/node"))
  await cp(
    path.join(packages, "loginom-host/test/fixtures/package-docs/demo.lgp"),
    path.join(directory, "Качество данных.lgp"),
  )
}
if (id !== "first") {
  await Bun.write(
    path.join(resources, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      ...(documentation ? { node: "bin/node" } : {}),
      files: await resourceInventory(resources),
    }),
  )
  const { verifyProductSkills } = await import("../../../loginom-host/src/bundled-skills")
  await verifyProductSkills(resources)
  process.env.LOGINOM_AI_AGENT_RESOURCES = resources
}

const steps: Step[] = [...scenario.steps]
const writeDraft = { name: "write", input: { path: "", content: "" } }
const fillDraft = { tools: [writeDraft] }
if (documentation) steps.splice(2, 0, fillDraft)
const model = scriptedModel(steps)
const host = scriptedHost({
  catalog: () => [
    {
      ...dockTool("dock_prepare"),
      inputSchema: {
        type: "object",
        properties: {
          host_context_token: { type: "string" },
          intent: { type: "string" },
          package_path: { type: "string" },
        },
        required: ["host_context_token", "intent", "package_path"],
      },
    },
  ],
  call: ({ name, args }) => {
    if (name !== "dock_prepare") throw Error(`Unexpected Loginom call: ${name}`)
    process.send?.({ kind: "host", args })
    const receipt = {
      status: "SUCCEEDED",
      operation_id: "gate-read-sales",
      package_path: "/user/Продажи.lgp",
      observations: [{ node: "Выручка", finding: "Перед расчётом нет проверки пустых значений" }],
    }
    return { content: [{ type: "text", text: JSON.stringify(receipt) }] }
  },
})
if (id === "instructions") await ServiceHost.start({ data: path.join(root, "data", "loginom"), connect: host.connect })
try {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* ServerProcess.start<never, never>({
          port: 0,
          password: gatePassword,
          app: { version: "2.3.0", channel: "dev" },
          database: { path: ":memory:" },
          fs: { filewatcher: false, fff: false },
          pluginPackages: false,
          models: { fetch: false, snapshot: false },
          fetch: async (input, init) => {
            const request = new Request(input, init)
            if (new URL(request.url).origin !== model.server.url.origin)
              throw Error(`Unexpected upstream: ${request.url}`)
            const body: unknown = await request.clone().json()
            const receipt = steps[0] === fillDraft && gateToolReplies(body).at(-1)
            if (receipt) {
              const result: unknown = JSON.parse(receipt)
              if (!result || typeof result !== "object" || !("report" in result) || typeof result.report !== "string")
                throw Error("Expected a documentation draft receipt")
              writeDraft.input.path = path.relative(directory, result.report).split(path.sep).join("/")
              if (!/^\.work\/package-docs\/Качество данных-[\da-f]{8}\/report\.md$/.test(writeDraft.input.path))
                throw Error("Unexpected documentation draft path")
              const draft = await readFile(path.join(directory, writeDraft.input.path), "utf8")
              writeDraft.input.content = draft
                .replace("PLACEHOLDER_PACKAGE_DESCRIPTION", "Пакет содержит один демонстрационный модуль.")
                .replace("PLACEHOLDER_MODULE_1_DESCRIPTION", "В модуле «Демо» два узла.")
            }
            process.send?.({ kind: "model", body })
            return fetch(request)
          },
          config: {
            directory,
            project: false,
            claude: false,
            content: JSON.stringify({
              model: gateModelID,
              small_model: gateModelID,
              enabled_providers: ["test"],
              formatter: false,
              lsp: false,
              provider: {
                test: {
                  name: "Gate fixture",
                  npm: "@ai-sdk/openai-compatible",
                  options: { baseURL: model.url, ["api" + "Key"]: "fixture" },
                  models: {
                    "test-model": {
                      name: "Тестовая модель",
                      tool_call: true,
                      limit: { context: 100_000, output: 10_000 },
                    },
                  },
                },
              },
            }),
          },
        })
        if (server.address._tag !== "InetAddressV4") throw Error("Expected a loopback TCP address")
        process.send?.({ kind: "ready", url: `http://127.0.0.1:${server.address.port}` })
        yield* Effect.promise(() => disconnected.promise)
      }),
    ),
  )
} finally {
  await ServiceHost.close()
  await model.server.stop(true)
}
