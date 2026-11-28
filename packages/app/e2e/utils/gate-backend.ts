import { cp, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { scriptedModel, type Step } from "../../../cli/test/fixture/product-run"
import { ServiceHost } from "../../../loginom-agent/src/host"
import { buildNodeHost } from "../../../loginom-host/script/build-node-host"
import { buildPackageDocs } from "../../../loginom-host/script/build-package-docs"
import { Loginom } from "../../../loginom-host/src/loginom"
import { loginomConnectionFixture } from "../../../loginom-host/test/fixtures/loginom-connection"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"
import { ServerProcess } from "../../../server/src/process"
import {
  gateLoginom,
  gateModelID,
  gateMessageContents,
  gatePassword,
  gateScenarios,
  gateToolReceipts,
  salesPackage,
  wizardDocumentation,
} from "./gate-scenarios"

const [root, id] = process.argv.slice(2)
if (!root || !process.send || (id !== "first" && id !== "documentation" && id !== "instructions")) {
  throw Error("Expected a gate profile and scenario")
}
const disconnected = Promise.withResolvers<void>()
process.once("disconnect", disconnected.resolve)
const scenario = gateScenarios[id]
const directory = path.join(root, "work")
const packages = path.resolve(import.meta.dir, "../../..")
const example = path.join(packages, "loginom-host/test/fixtures/package-docs/demo.lgp")
const documentationFile = path.basename(gateLoginom.documentationPath)
const documentation = id === "documentation"
const loginom = await loginomConnectionFixture({
  packages: {
    [salesPackage.path]: { file: example, name: salesPackage.name },
    [gateLoginom.documentationPath]: { file: example, name: "Качество данных" },
  },
  onOpen: (path) => process.send?.({ kind: "package-opened", path }),
})
const { resources } = loginom
const chatWrite = { name: "write", input: { path: "", content: "" } }
const wizardWrite = { name: "write", input: { path: "", content: "" } }
function documentSteps(write: typeof chatWrite, answer: string): Step[] {
  return [
    { tools: [{ name: "package_docs_run", input: { operation: "skeleton", lgp: documentationFile } }] },
    { tools: [write] },
    ...["pdf", "docx"].map((format) => ({
      tools: [{ name: "package_docs_run", input: { operation: "emit", lgp: documentationFile, format } }],
    })),
    { text: answer },
  ]
}
const steps: Step[] =
  "steps" in scenario
    ? [...scenario.steps]
    : [{ tools: [{ name: "skill", input: { id: "package-docs" } }] }, ...documentSteps(chatWrite, scenario.answer)]
const wizardSteps = documentSteps(wizardWrite, wizardDocumentation.answer)
const model = scriptedModel(steps)
const wizardModel = documentation ? scriptedModel(wizardSteps) : undefined
try {
  await mkdir(directory)
  if (documentation) {
    // The current wizard accepts a previously downloaded copy from Loginom.
    const login = await fetch(new URL("/login", loginom.url), {
      method: "POST",
      body: new URLSearchParams({ username: gateLoginom.username, password: gateLoginom.password }),
    })
    const cookie = login.headers.getSetCookie()[0]?.split(";", 1)[0]
    if (!login.ok || !cookie) throw Error("Loginom fixture rejected the download account")
    const source = new URL("/package", loginom.url)
    source.search = new URLSearchParams({ path: gateLoginom.documentationPath, download: "1" }).toString()
    const response = await fetch(source, { headers: { cookie } })
    if (!response.ok) throw Error(`Loginom fixture could not download the package (${response.status})`)
    await Bun.write(path.join(directory, documentationFile), response)
    await fetch(new URL("/logout", loginom.url), { method: "POST", headers: { cookie } })
  }
  await buildNodeHost(path.join(resources, "host"))
  if (id !== "first") {
    const skills = path.join(resources, "skills")
    await cp(path.join(packages, "product/skills"), skills, { recursive: true })
    await buildPackageDocs(path.join(skills, "package-docs/scripts"))
    const manifest = Bun.file(path.join(resources, "resource-manifest.json"))
    const bundled = await manifest.json()
    const files = await resourceInventory(skills)
    await manifest.write(
      JSON.stringify({
        ...bundled,
        files: [
          ...bundled.files,
          ...files.map((file) => ({
            ...file,
            path: `skills/${file.path}`,
          })),
        ],
      }),
    )
    process.env.LOGINOM_AI_AGENT_RESOURCES = resources
  }
  process.env.LOGINOM_AI_AGENT_HEADLESS = "1"
  await ServiceHost.start({ data: path.join(root, "data"), resources })
  await ServiceHost.connectionSettings.request("connection.status", {})
  if (id !== "first") {
    const request = ServiceHost.connectionSettings.request
    const revision = 0
    await request("connection.verify-resources", {}, 60_000)
    const { validationId } = Schema.decodeUnknownSync(Loginom.Validation)(
      await request(
        "connection.check",
        {
          revision,
          url: loginom.url,
          username: gateLoginom.username,
          password: { operation: "replace", value: gateLoginom.password },
        },
        60_000,
      ),
    )
    await request("connection.save", { revision, validationId }, 60_000)
    await ServiceHost.dashboard.catalog()
  }
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* ServerProcess.start<never, never>({
          port: 0,
          hostname: "127.0.0.1",
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
            const wizard =
              wizardModel && gateMessageContents(body, "user").some((text) => text.includes(wizardDocumentation.prompt))
            const script = wizard ? wizardSteps : steps
            const write = wizard ? wizardWrite : chatWrite
            const hasTools =
              !!body &&
              typeof body === "object" &&
              "tools" in body &&
              Array.isArray(body.tools) &&
              body.tools.length > 0
            const next = script[0]
            if (hasTools && next && "tools" in next && next.tools.includes(write)) {
              const report = gateToolReceipts(body).find(
                (receipt): receipt is { report: string } =>
                  !!receipt &&
                  typeof receipt === "object" &&
                  "report" in receipt &&
                  typeof receipt.report === "string" &&
                  /\/\.work\/package-docs\/Качество данных-[\da-f]{8}\/report\.md$/.test(
                    receipt.report.split(path.sep).join("/"),
                  ),
              )
              if (!report || !report.report.startsWith(root + path.sep))
                throw Error("Expected the gate's generated report")
              const work = path.resolve(path.dirname(report.report), "../../..")
              write.input.path = path.relative(work, report.report).split(path.sep).join("/")
              write.input.content = (await readFile(report.report, "utf8"))
                .replace("PLACEHOLDER_PACKAGE_DESCRIPTION", "Пакет содержит один демонстрационный модуль.")
                .replace("PLACEHOLDER_MODULE_1_DESCRIPTION", "В модуле «Демо» два узла.")
            }
            process.send?.({ kind: "model", body })
            if (wizard && wizardModel) {
              return fetch(new URL(new URL(request.url).pathname, wizardModel.server.url), {
                method: request.method,
                headers: request.headers,
                body: JSON.stringify(body),
              })
            }
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
        process.send?.({ kind: "ready", url: `http://127.0.0.1:${server.address.port}`, loginomURL: loginom.url })
        yield* Effect.promise(() => disconnected.promise)
      }),
    ),
  )
} finally {
  try {
    await ServiceHost.close()
  } finally {
    await Promise.all([loginom.close(), model.server.stop(true), wizardModel?.server.stop(true)])
  }
}
