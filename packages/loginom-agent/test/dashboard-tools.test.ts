// The dashboard's tools (B2.9e…g): the cases of 0.4 `v0.4.0:packages/opencode/test/tool/dashboard.test.ts` that called
// the tool itself — `dashboard_draft` twice; `dashboard_publish` and `dashboard_delete` with their questions answered by
// the case (0.4 `ctx.ask`) — on the plugin's tools, plus the Location's own draft server, which `close` stops. On a
// server — where the tools exist, the plugin's unload stops the draft server, and the question comes by the permission
// kind — `server/test/loginom-dashboard-{draft,publish,delete}.test.ts`. Each case's folder and resources are its own,
// under a temporary data root (`fixture/dashboard-folder.ts`); the Host of a publication or a deletion is the server
// process's (`ServiceHost`), scripted (`server/test/fixture/loginom-dock-host.ts`).
import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { readDashboardSnapshot } from "@loginom-ai-agent/dashboard/agent/folder"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { Agent } from "@opencode/schema/agent"
import { Permission } from "@opencode/schema/permission"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { publicationName, publications, scriptedHost } from "../../server/test/fixture/loginom-dock-host"
import { dashboardTools } from "../src/dashboard-tools"
import { declinedText } from "../src/permissions"
import { ServiceHost } from "../src/host"
import { dashboardFolder, link, served } from "./fixture/dashboard-folder"
import { temporaryData } from "./fixture/temporary-data"

// Builds run the template's compiler and bundler as child processes.
const timeout = 120_000

const call = (
  signal = new AbortController().signal,
  progress: ToolContext["progress"] = async () => {},
): ToolContext => ({
  sessionID: Session.ID.create(),
  agent: Agent.ID.make("build"),
  messageID: SessionMessage.ID.create(),
  id: Tool.CallID.make(`call_${crypto.randomUUID()}`),
  signal,
  progress,
})

type Question = { action: string; resources: readonly string[]; metadata?: Record<string, unknown> }

// The plugin's side of the tools: `ask` answers the question of a publication or a deletion, `bound` checks that the
// chat belongs to its draft (by default it does), and `retire` marks the chat that deleted its dashboard.
const session = (
  ask: (request: Question) => Promise<void> = async () => {
    throw Error("nothing is asked")
  },
  bound = async () => {},
  retire = async (_sessionID: string) => {},
) => ({
  permission: { assert: ask, list: async () => [], reply: async () => {} },
  bound,
  retire,
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

// The Host of the server process, scripted, with the dashboard's publications in Loginom (`publications`, or the case's
// own answers).
async function serviceHost(
  folder: { resources: string },
  dashboard: (method: string, input: Record<string, unknown>) => unknown = publications(),
) {
  const host = scriptedHost({ dashboard })
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
      await using host = await serviceHost(folder, publications({ error: code }))
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
    await using host = await serviceHost(folder, publications(store))
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

test(
  "a stop withdraws the call's own question once it is open, and no other",
  async () => {
    await using folder = await dashboardFolder()
    await using host = await serviceHost(folder)
    const controller = new AbortController()
    const context = call(controller.signal)
    const question = Promise.withResolvers<void>()
    const listed: number[] = []
    const replies: unknown[] = []
    const request = (id: string, callID: string) => ({
      id: Permission.ID.make(id),
      sessionID: context.sessionID,
      action: "dashboard_publish",
      resources: [],
      source: { type: "tool" as const, messageID: context.messageID, id: callID },
    })
    const tools = dashboardTools(folder.work, folder.resources, {
      permission: {
        // The user stops the call while its question is still being evaluated; the question stays open until a reply.
        assert: async () => {
          setTimeout(() => controller.abort(), 0)
          return question.promise
        },
        list: async () => {
          listed.push(listed.length + 1)
          return listed.length === 1 ? [] : [request("per_other", "call_other"), request("per_own", context.id)]
        },
        reply: async (input) => {
          replies.push(input)
          question.resolve()
        },
      },
      bound: async () => {},
      retire: async () => {},
    })
    await expect(tools.publish.execute({}, context)).rejects.toThrow()
    expect(listed).toEqual([1, 2])
    expect(replies).toEqual([{ sessionID: context.sessionID, requestID: "per_own", decision: "once" }])
    expect(host.requests("dashboardPublish")).toEqual([])
  },
  timeout,
)

// The deletion (B2.9g): 0.4's cases of `dashboard_delete` whose Host answers come between the questions. Its questions are
// answered in turn by the case (`questions`); the cases where the session's rules decide them are on the server
// (`server/test/loginom-dashboard-delete.test.ts`).
const version = { name: publicationName, sourceHash: "a".repeat(64) }
const listed = ["acquire", "scope", "dashboardVersions", "release"]
const deleting = ["acquire", "scope", "dashboardDelete", "release"]
const deletedText = "Дашборд удалён. Опубликованных версий и локального черновика больше нет."

// Answers the deletion's questions in turn: `once` approves, `reject` declines as the user's «Отклонить» does (OpenCode's
// `Permission.DeclinedError`), a function runs and then approves. A question beyond the answers fails the call.
function questions(...answers: ("once" | "reject" | ((question: Question) => unknown))[]) {
  const asked: Question[] = []
  const ask = async (question: Question) => {
    asked.push(question)
    const answer = answers[asked.length - 1]
    if (answer === undefined) throw Error("Unexpected deletion question")
    if (answer === "reject") throw Object.assign(new Error("declined"), { _tag: "Permission.DeclinedError" })
    if (answer !== "once") await answer(question)
  }
  return { asked, ask }
}

const exists = (file: string) => Bun.file(file).exists()

test(
  "delete asks for the updated publication set after the first approval",
  async () => {
    await using folder = await dashboardFolder()
    const updated = [
      { name: "20261115T110000Z.json", sourceHash: "b".repeat(64) },
      { ...version, sourceHash: "c".repeat(64) },
    ]
    const store = { versions: [version] }
    await using host = await serviceHost(folder, (method, input) => {
      if (method === "dashboardVersions") return { generation: 1, versions: store.versions }
      expect(input.expected).toEqual([version])
      return { status: "changed", remaining: store.versions, confirmedRemoved: 0 }
    })
    const answers = questions(() => {
      store.versions = updated
    }, "reject")
    const control = await Bun.file(join(folder.work, "../control/binding.json")).json()
    const tools = dashboardTools(folder.work, folder.resources, session(answers.ask))
    expect(tools.remove.options).toEqual({ codemode: false })
    await expect(tools.remove.execute({}, call())).rejects.toMatchObject({ _tag: "Permission.DeclinedError" })
    // Each question names the bound node and package and the set it deletes; it saves nothing (0.4 `always: []`).
    expect(answers.asked.map((question) => question.metadata)).toEqual([
      { publicationCount: 1 },
      { publicationCount: 2 },
    ])
    for (const question of answers.asked) {
      expect(question).toMatchObject({
        action: "dashboard_delete",
        resources: [control.nodeName, control.binding.packagePath],
      })
      expect(question).not.toHaveProperty("save")
    }
    expect(host.log.map((request) => request.method)).toEqual([...listed, ...deleting])
    expect(store.versions).toEqual(updated)
    expect(await exists(join(folder.work, "src/main.tsx"))).toBe(true)
  },
  timeout,
)

test(
  "declining the new deletion set preserves confirmed removals in the terminal tool error",
  async () => {
    await using folder = await dashboardFolder()
    const remaining = [{ ...version, sourceHash: "b".repeat(64) }]
    await using host = await serviceHost(folder, (method) =>
      method === "dashboardVersions"
        ? { generation: 1, versions: [version] }
        : { status: "changed", confirmedRemoved: 1, remaining },
    )
    const answers = questions("once", "reject")
    const progress: unknown[] = []
    const tools = dashboardTools(folder.work, folder.resources, session(answers.ask))
    const error = await tools.remove
      .execute(
        {},
        call(undefined, async (update) => void progress.push(update)),
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(answers.asked[1]?.metadata).toEqual({ publicationCount: 1, confirmedRemoved: 1 })
    expect(error).toBeInstanceOf(Tool.Error)
    expect(error).toHaveProperty(
      "message",
      declinedText + " Подтверждено удаление версий: 1. Локальный черновик сохранён.",
    )
    expect(error).toHaveProperty("metadata", {
      confirmedRemoved: 1,
      permissionDenied: true,
      permissionRefusal: "declined",
    })
    expect(progress).toEqual([{ confirmedRemoved: 1 }])
    expect(host.requests("dashboardDelete")).toHaveLength(1)
    expect(await exists(join(folder.work, "src/main.tsx"))).toBe(true)
  },
  timeout,
)

test(
  "delete reports confirmed partial progress and submits only the newly approved set",
  async () => {
    await using folder = await dashboardFolder()
    const remaining = [{ ...version, sourceHash: "b".repeat(64) }]
    const attempts = { count: 0 }
    await using host = await serviceHost(folder, (method) => {
      if (method === "dashboardVersions") return { generation: 7, versions: [version] }
      attempts.count++
      if (attempts.count === 1) return { status: "changed", confirmedRemoved: 1, remaining }
      if (attempts.count === 2) return { status: "changed", confirmedRemoved: 0, remaining: [] }
      return { status: "empty" }
    })
    const answers = questions(
      "once",
      () => expect(attempts.count).toBe(1),
      async () => {
        expect(attempts.count).toBe(2)
        expect(await exists(join(folder.work, "src/main.tsx"))).toBe(true)
      },
    )
    const retired: string[] = []
    const progress: unknown[] = []
    const context = call(undefined, async (update) => void progress.push(update))
    const tools = dashboardTools(
      folder.work,
      folder.resources,
      session(answers.ask, undefined, async (id) => void retired.push(id)),
    )
    expect(await tools.remove.execute({}, context)).toEqual({
      content: deletedText,
      metadata: { dashboardDeleted: true },
    })
    expect(answers.asked.map((question) => question.metadata)).toEqual([
      { publicationCount: 1 },
      { publicationCount: 1, confirmedRemoved: 1 },
      { publicationCount: 0, confirmedRemoved: 1 },
    ])
    expect(host.requests("dashboardVersions")).toHaveLength(1)
    expect(host.requests("dashboardDelete").map((request) => [request.generation, request.expected])).toEqual([
      [7, [version]],
      [7, remaining],
      [7, []],
    ])
    expect(progress).toEqual([{ confirmedRemoved: 1 }])
    expect(await exists(join(folder.work, "src/main.tsx"))).toBe(false)
    expect(retired).toEqual([context.sessionID])
  },
  timeout,
)

for (const outcome of ["unknown", "denied", "invalid", "invalid count"] as const)
  test(
    "delete keeps sources and live preview after " + outcome,
    async () => {
      await using folder = await dashboardFolder()
      const source = join(folder.work, "src/main.tsx")
      const original = await Bun.file(source).text()
      const remaining = { name: "20261115T120001Z.json", sourceHash: "b".repeat(64) }
      const store = { versions: [version, remaining], attempts: 0 }
      await using host = await serviceHost(folder, (method, input) => {
        if (method === "dashboardVersions") return { generation: 1, versions: store.versions }
        if (++store.attempts === 2) {
          expect(input.expected).toEqual([remaining])
          store.versions = []
          return { status: "empty" }
        }
        if (outcome === "invalid") return { status: "empty", remaining: store.versions }
        if (outcome === "invalid count") return { status: "changed", remaining: [remaining], confirmedRemoved: 3 }
        store.versions = [remaining]
        return outcome === "unknown"
          ? { status: "failed", reason: "DASHBOARD_DELETE_UNKNOWN", confirmedRemoved: 1 }
          : { status: "failed", reason: "DASHBOARD_ACCESS_DENIED", confirmedRemoved: 1, remaining: store.versions }
      })
      const answers = questions("once", (question) => {
        // The retry starts from the stand's listing, before anything is deleted again.
        expect(question.metadata).toEqual({ publicationCount: 1 })
        expect(host.requests("dashboardVersions")).toHaveLength(2)
        expect(store.attempts).toBe(1)
      })
      const tools = dashboardTools(folder.work, folder.resources, session(answers.ask))
      const url = link((await tools.draft.execute({}, call())).content)
      expect(url).toBeString()
      const data = () => fetch(url + "data")
      const before = await data().then((response) => response.json())
      expect(before).toMatchObject({ sample: { rows: [[7]] } })
      const result = await tools.remove.execute({}, call())
      expect(String(result.content)).toContain(
        outcome === "denied" ? "Недостаточно прав" : "Не удалось подтвердить результат",
      )
      if (outcome === "invalid" || outcome === "invalid count")
        expect(String(result.content)).not.toContain("Подтверждено удаление версий")
      else expect(String(result.content)).toContain("Подтверждено удаление версий: 1")
      expect(result.metadata).toEqual({ isError: true })
      expect(answers.asked).toHaveLength(1)
      expect(store.attempts).toBe(1)
      expect(await Bun.file(source).text()).toBe(original)
      expect(await data().then((response) => response.json())).toEqual(before)
      if (outcome === "unknown") {
        expect((await tools.remove.execute({}, call())).content).toBe(deletedText)
        expect(await exists(source)).toBe(false)
        // The deleted draft is no longer served.
        expect((await data()).status).toBe(404)
      }
      await tools.close()
    },
    timeout,
  )

test(
  "delete preserves a newly prepared snapshot and retries from a fresh empty listing",
  async () => {
    await using folder = await dashboardFolder()
    const binding = {
      packagePath: "/fixture/orders.lgp",
      workflowGuid: crypto.randomUUID(),
      nodeGuid: crypto.randomUUID(),
    }
    const work = await folder.prepare(binding)
    const captured = readDashboardSnapshot(work)!.control.snapshotId
    const store = { versions: [version] }
    await using host = await serviceHost(folder, (method, input) => {
      if (method === "dashboardVersions") return { generation: 1, versions: store.versions }
      expect(input).toMatchObject({ binding, expected: store.versions })
      store.versions = []
      return { status: "empty" }
    })
    const refreshed: { snapshot?: ReturnType<typeof readDashboardSnapshot> } = {}
    const answers = questions(
      async () => {
        // The folder is prepared again for the same node while the user answers.
        expect(await folder.prepare(binding)).toBe(work)
        refreshed.snapshot = readDashboardSnapshot(work)
      },
      (question) => {
        expect(question.metadata).toEqual({ publicationCount: 0 })
        expect(host.requests("dashboardVersions")).toHaveLength(2)
        expect(host.requests("dashboardDelete")).toHaveLength(1)
      },
    )
    const tools = dashboardTools(work, folder.resources, session(answers.ask))
    expect(String((await tools.remove.execute({}, call())).content)).toMatch(
      /подтверждено отсутствие опубликованных версий.*папку черновика удалить не удалось/,
    )
    expect(readDashboardSnapshot(work)!.control).toEqual(refreshed.snapshot!.control)
    expect(readDashboardSnapshot(work)!.control.snapshotId).not.toBe(captured)
    expect(await exists(join(work, "src/main.tsx"))).toBe(true)
    expect(store.versions).toEqual([])
    expect((await tools.remove.execute({}, call())).content).toBe(deletedText)
    expect(host.requests("dashboardDelete")).toHaveLength(2)
    expect(await exists(join(work, "src/main.tsx"))).toBe(false)
  },
  timeout,
)

// 0.4 «approval belongs to the draft that requested permission», for a deletion: the captured binding is checked against
// the chat's draft before the listing, and again after each question (on a server: «approval from a deleted draft…»).
for (const [when, at] of [
  ["before the listing", 1],
  ["after the question", 2],
] as const)
  test(
    "a chat that no longer belongs to its draft deletes nothing: " + when,
    async () => {
      await using folder = await dashboardFolder()
      await using host = await serviceHost(folder, () => ({ generation: 1, versions: [version] }))
      const checks: number[] = []
      const tools = dashboardTools(
        folder.work,
        folder.resources,
        session(questions("once").ask, async () => {
          checks.push(checks.length + 1)
          if (checks.length === at) throw Error("LOGINOM_SCOPE_DENIED: fixture")
        }),
      )
      await expect(tools.remove.execute({}, call())).rejects.toThrow("LOGINOM_SCOPE_DENIED: fixture")
      expect(checks).toHaveLength(at)
      expect(host.log.map((request) => request.method)).toEqual(at === 1 ? [] : listed)
      expect(await exists(join(folder.work, "src/main.tsx"))).toBe(true)
    },
    timeout,
  )

test(
  "delete removes two versions and the local draft, and leaves the neighbour available",
  async () => {
    await using folder = await dashboardFolder()
    const binding = {
      packagePath: "/fixture/orders.lgp",
      workflowGuid: crypto.randomUUID(),
      nodeGuid: crypto.randomUUID(),
    }
    const neighbourBinding = { ...binding, nodeGuid: crypto.randomUUID() }
    const work = await folder.prepare(binding)
    const neighbour = await folder.prepare(neighbourBinding)
    const neighbourVersion = { name: publicationName, sourceHash: "c".repeat(64) }
    const key = (item: unknown) => {
      const value = item as typeof binding
      return JSON.stringify([value.packagePath, value.workflowGuid, value.nodeGuid])
    }
    const versions = new Map([
      [
        key(binding),
        [
          { name: "20261115T110000Z.json", sourceHash: "a".repeat(64) },
          { name: publicationName, sourceHash: "b".repeat(64) },
        ],
      ],
      [key(neighbourBinding), [neighbourVersion]],
    ])
    const respond = (method: string, input: Record<string, unknown>) => {
      const remaining = versions.get(key(input.binding)) ?? []
      if (method === "dashboardVersions") return { generation: 1, versions: remaining }
      if (input.generation !== 1) throw Error("Captured generation required")
      if (JSON.stringify(input.expected) !== JSON.stringify(remaining))
        return { status: "changed", remaining, confirmedRemoved: 0 }
      versions.delete(key(input.binding))
      return { status: "empty" }
    }
    await using host = await serviceHost(folder, respond)
    const answers = questions((question) => expect(question.metadata).toEqual({ publicationCount: 2 }))
    const tools = dashboardTools(work, folder.resources, session(answers.ask))
    expect((await tools.remove.execute({}, call())).content).toBe(deletedText)
    expect(host.log.map((request) => request.method)).toEqual([...listed, ...deleting])
    expect(respond("dashboardVersions", { binding })).toEqual({ generation: 1, versions: [] })
    expect(respond("dashboardVersions", { binding: neighbourBinding })).toEqual({
      generation: 1,
      versions: [neighbourVersion],
    })
    expect(await exists(join(work, "src/main.tsx"))).toBe(false)
    expect(await exists(join(neighbour, "src/main.tsx"))).toBe(true)
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
