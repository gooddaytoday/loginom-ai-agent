// The dashboard's tools (B2.9e, B2.9f): the cases of 0.4 `v0.4.0:packages/opencode/test/tool/dashboard.test.ts` that
// called the tool itself — `dashboard_draft` twice; `dashboard_publish` with its question answered by the case (0.4
// `ctx.ask`) — on the plugin's tools, plus the Location's own draft server, which `close` stops. On a server — where the
// tools exist, the plugin's unload stops the draft server, and the question comes by the permission kind —
// `server/test/loginom-dashboard-draft.test.ts` and `server/test/loginom-dashboard-publish.test.ts`. Each case's folder
// and resources are its own, under a temporary data root (`fixture/dashboard-folder.ts`); a publication's Host is the
// server process's (`ServiceHost`), scripted (`server/test/fixture/loginom-dock-host.ts`).
import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { Agent } from "@opencode/schema/agent"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { publications, scriptedHost } from "../../server/test/fixture/loginom-dock-host"
import { dashboardTools } from "../src/dashboard-tools"
import { ServiceHost } from "../src/host"
import { dashboardFolder, link, served } from "./fixture/dashboard-folder"
import { temporaryData } from "./fixture/temporary-data"

// Builds run the template's compiler and bundler as child processes.
const timeout = 120_000

const call = (signal = new AbortController().signal): ToolContext => ({
  sessionID: Session.ID.create(),
  agent: Agent.ID.make("build"),
  messageID: SessionMessage.ID.create(),
  id: Tool.CallID.make(`call_${crypto.randomUUID()}`),
  signal,
  progress: async () => {},
})

// The plugin's side of the tools: `ask` answers the publication's question, and `bound` checks that the chat belongs to
// its draft (by default it does).
const session = (
  ask: (request: { resources: readonly string[]; metadata?: Record<string, unknown> }) => Promise<void> = async () => {
    throw Error("nothing is asked")
  },
  bound = async () => {},
) => ({
  permission: { assert: ask, list: async () => [], reply: async () => {} },
  bound,
})

test("dashboard_draft reports missing installation resources", async () => {
  await using data = await temporaryData()
  const tools = dashboardTools(data.directory, undefined, session())
  await expect(tools.draft.execute({}, call())).rejects.toThrow("DASHBOARD_RESOURCES_MISSING")
  // Outside the CodeMode catalog, whatever the transforms do: the model calls it by name.
  expect(tools.draft.options).toEqual({ codemode: false })
})

test(
  "dashboard_draft limits the complete diagnostic output to whole UTF-8 code points",
  async () => {
    await using folder = await dashboardFolder()
    await Bun.write(
      join(folder.work, "src/main.tsx"),
      Array.from({ length: 150 }, (_, index) => `const ошибка${index} = отсутствует𝒳${index};`).join("\n"),
    )
    const tools = dashboardTools(folder.work, folder.resources, session())
    const result = await tools.draft.execute({}, call())
    const output = String(result.content)
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(8192)
    expect(Buffer.byteLength(output)).toBeGreaterThan(8188)
    expect(output).toStartWith("Сборка не удалась. Исправьте код и вызовите dashboard_draft снова.\n")
    expect(output).toContain("отсутствует𝒳")
    expect(output).not.toContain("�")
    await tools.close()
  },
  timeout,
)

test(
  "a Location's draft server serves its drafts until close, and no draft starts it again",
  async () => {
    await using folder = await dashboardFolder()
    const tools = dashboardTools(folder.work, folder.resources, session())
    const result = await tools.draft.execute({}, call())
    expect(String(result.content)).toContain("Проверка типов и сборка: успешно.\nСамопроверка страницы: успешно")
    const url = link(result.content)
    expect(url).toBeString()
    expect(await served(url!)).toBe(200)
    await tools.close()
    expect(await served(url!)).toBe("refused")
    await expect(tools.draft.execute({}, call())).rejects.toThrow("Черновик остановлен")
  },
  timeout,
)

// The Host of the server process, scripted, with the dashboard's publications in Loginom (`publications`).
async function serviceHost(folder: { resources: string }, store: Parameters<typeof publications>[0] = {}) {
  const host = scriptedHost({ dashboard: publications(store) })
  await ServiceHost.start({ data: dirname(folder.resources), connect: host.connect })
  return Object.assign(host, { [Symbol.asyncDispose]: () => ServiceHost.close() })
}

test(
  "interruption joins an active publication build before removing its operation",
  async () => {
    await using folder = await dashboardFolder()
    const tools = dashboardTools(folder.work, folder.resources, session())
    const controller = new AbortController()
    const running = tools.publish.execute({}, call(controller.signal)).then(
      () => undefined,
      () => undefined,
    )
    const root = join(folder.work, "../..")
    const operation = await until(async () => {
      for (const name of (await readdir(root)).filter((name) => name.startsWith(".stage-"))) {
        const path = join(root, name)
        if ((await readdir(path).catch(() => [])).some((name) => name.startsWith(".build-"))) return path
      }
    })
    controller.abort()
    // The call settles only once its build stopped and its operation is gone.
    await running
    expect(await Bun.file(join(folder.work, "../control/draft/current")).exists()).toBe(false)
    expect(
      await readdir(operation).then(
        () => true,
        () => false,
      ),
    ).toBe(false)
    expect(await Bun.file(join(folder.work, "sample.json")).exists()).toBe(true)
  },
  timeout,
)

test(
  "publication limits the complete model output to whole UTF-8 code points",
  async () => {
    await using folder = await dashboardFolder()
    const value = "🟢".repeat(8192)
    const sample = Bun.file(join(folder.work, "sample.json"))
    await Bun.write(sample, JSON.stringify({ ...(await sample.json()), rows: [[value]] }))
    await Bun.write(join(folder.work, "src/main.tsx"), "document.body.textContent = " + JSON.stringify(value))
    const tools = dashboardTools(
      folder.work,
      folder.resources,
      session(async () => {
        throw Error("Embedded values must block publication")
      }),
    )
    const output = String((await tools.publish.execute({}, call())).content)
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(8192)
    expect(output).toMatch(/^failed: Сборка не удалась\.\n.*публичной\./)
    expect(output.endsWith("🟢")).toBe(true)
    expect(Buffer.byteLength(output + "🟢")).toBeGreaterThan(8192)
    expect(output).not.toContain("�")
  },
  timeout,
)

for (const code of [
  "DASHBOARD_ACCESS_DENIED",
  "DASHBOARD_VERSION_EXISTS",
  "DASHBOARD_WRITE_UNKNOWN",
  "LOGINOM_RUNTIME_CLEANUP_FAILED",
])
  test(
    "host failure preserves the draft and its specific reason without retry: " + code,
    async () => {
      await using folder = await dashboardFolder()
      await using host = await serviceHost(folder, { error: code })
      const tools = dashboardTools(
        folder.work,
        folder.resources,
        session(async () => {}),
      )
      const output = String((await tools.publish.execute({}, call())).content)
      expect(output).toStartWith("failed: ")
      expect(output).toContain(code)
      if (code === "DASHBOARD_ACCESS_DENIED") expect(output).toContain("Недостаточно прав")
      if (code === "DASHBOARD_WRITE_UNKNOWN") expect(output).toContain("автоматически не выполняется")
      expect(host.requests("dashboardPublish")).toHaveLength(1)
      expect(await Bun.file(join(folder.work, "sample.json")).exists()).toBe(true)
      expect(await Bun.file(join(folder.work, "src/main.tsx")).exists()).toBe(true)
    },
    timeout,
  )

test(
  "a changed server version requires new confirmation and preserves edited sources",
  async () => {
    await using folder = await dashboardFolder()
    const latest = { name: "20261115T110000Z.json", sourceHash: "a".repeat(64) }
    const store = { latest, changed: false }
    await using host = await serviceHost(folder, store)
    const control = await Bun.file(join(folder.work, "../control/binding.json")).json()
    const before = await Bun.file(join(folder.work, "src/main.tsx")).text()
    const approved: { hash?: unknown } = {}
    const tools = dashboardTools(
      folder.work,
      folder.resources,
      session(async (request) => {
        // The question names the bound node and package, and the version the local draft did not start from.
        expect(request.resources).toEqual([control.nodeName, control.binding.packagePath])
        expect(request.metadata).toMatchObject({ dashboardConflict: { base: null, latest } })
        approved.hash = request.metadata?.sourceHash
        await Bun.write(join(folder.work, "src/main.tsx"), "document.body.textContent = 'new local draft'")
        store.latest = { name: "20261115T120000Z.json", sourceHash: "b".repeat(64) }
        store.changed = true
      }),
    )
    expect(tools.publish.options).toEqual({ codemode: false })
    const output = String((await tools.publish.execute({}, call())).content)
    expect(output).toStartWith("needs-confirmation:")
    const writes = host.requests("dashboardPublish")
    expect(writes).toHaveLength(1)
    expect(writes[0]?.expected).toEqual(latest)
    const content = String(writes[0]?.content)
    expect(approved.hash).toBeString()
    expect(createHash("sha256").update(content).digest("hex")).toBe(String(approved.hash))
    expect(JSON.parse(content).files.find((file: { path: string }) => file.path === "src/main.tsx").content).toBe(
      before,
    )
    expect(await Bun.file(join(folder.work, "src/main.tsx")).text()).toContain("new local draft")
    expect(await Bun.file(join(folder.work, "sample.json")).exists()).toBe(true)
    // Each Host request ran on a run of its own, bound to the dashboard's profile, and released.
    expect(host.log.map((request) => request.method)).toEqual([
      ...["acquire", "scope", "dashboardRead", "release"],
      ...["acquire", "scope", "dashboardPublish", "release"],
    ])
    expect(host.requests("scope").map((request) => (request.scope as { profile: string }).profile)).toEqual([
      "loginom-dashboard",
      "loginom-dashboard",
    ])
  },
  timeout,
)

test(
  "an approval that arrives once the call was stopped sends nothing",
  async () => {
    await using folder = await dashboardFolder()
    await using host = await serviceHost(folder)
    const controller = new AbortController()
    const tools = dashboardTools(
      folder.work,
      folder.resources,
      session(async () => controller.abort()),
    )
    await expect(tools.publish.execute({}, call(controller.signal))).rejects.toThrow()
    expect(host.requests("dashboardPublish")).toEqual([])
    expect(await Bun.file(join(folder.work, "sample.json")).exists()).toBe(true)
  },
  timeout,
)

// 0.4 compared the captured draft with the session's after the build and checked the session again after the question.
for (const [when, at] of [
  ["after the build", 1],
  ["after the question", 2],
] as const)
  test(
    "a chat that no longer belongs to its draft sends nothing: " + when,
    async () => {
      await using folder = await dashboardFolder()
      await using host = await serviceHost(folder)
      const checks: number[] = []
      const tools = dashboardTools(
        folder.work,
        folder.resources,
        session(
          async () => {},
          async () => {
            checks.push(checks.length + 1)
            if (checks.length === at) throw Error("LOGINOM_SCOPE_DENIED: fixture")
          },
        ),
      )
      await expect(tools.publish.execute({}, call())).rejects.toThrow("LOGINOM_SCOPE_DENIED: fixture")
      expect(checks).toHaveLength(at)
      expect(host.log.map((request) => request.method)).toEqual(
        at === 1 ? [] : ["acquire", "scope", "dashboardRead", "release"],
      )
    },
    timeout,
  )

async function until<T>(read: () => Promise<T | undefined>, deadline = Date.now() + 60_000): Promise<T> {
  const value = await read()
  if (value !== undefined) return value
  if (Date.now() > deadline) throw Error("Timed out waiting for condition")
  await Bun.sleep(20)
  return until(read, deadline)
}
