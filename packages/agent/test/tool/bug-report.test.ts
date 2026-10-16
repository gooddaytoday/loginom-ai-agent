import { afterAll, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { mkdir, rm, utimes, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js"
import { Effect, Exit, Layer } from "effect"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { Global } from "@loginom-ai-agent/core/global"
import { ProviderV2 } from "@loginom-ai-agent/core/provider"
import { ModelV2 } from "@loginom-ai-agent/core/model"
import { AppProcess } from "@loginom-ai-agent/core/process"
import { SessionProjector } from "@loginom-ai-agent/core/session/projector"
import { SessionV1 } from "@loginom-ai-agent/core/v1/session"
import { productSkillsDirectory } from "@loginom-ai-agent/product/skills"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { TaskScope } from "@/session/task-scope"
import { SessionTools } from "@/session/tools"
import { BugReportTool } from "@/tool/bug-report"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { TestConfig } from "../fixture/config"
import { TestInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const profileLogs = mkdtempSync(join(tmpdir(), "bug-report-profile-"))
const desktopLogs = mkdtempSync(join(tmpdir(), "bug-report-desktop-"))
const previousProfileLog = Global.Path.log
Global.Path.log = profileLogs
process.env.LOGINOM_AI_AGENT_DESKTOP_LOG_ROOT = desktopLogs
const secrets = [
  "chat-secret-token-value",
  "log-secret-password-value",
  "sk-logsecretkeyvalue12",
  "DATAURLSECRETBYTES",
  "attachment-secret-token-value",
  "LINE21_MUST_STAY_OUT",
  "NETLOGSECRETBYTES",
  "user:pass@",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
]
afterAll(() => {
  Global.Path.log = previousProfileLog
  delete process.env.LOGINOM_AI_AGENT_DESKTOP_LOG_ROOT
  return Promise.all([rm(profileLogs, { recursive: true, force: true }), rm(desktopLogs, { recursive: true, force: true })])
})

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([
        Agent.node,
        Session.node,
        SessionProjector.node,
        FSUtil.node,
        Truncate.node,
        RuntimeFlags.node,
        Global.node,
      ]),
    ),
    testInstanceStoreLayer,
  ),
)

it.instance(
  "collects a redacted session export and recent logs, then packs a confirmed report",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const sessions = yield* Session.Service
      const agents = yield* Agent.Service
      const agent = yield* agents.get("build")
      const run = join(desktopLogs, "20261012T120000")
      yield* Effect.promise(() => mkdir(run, { recursive: true }))
      yield* Effect.promise(() =>
        writeFile(join(profileLogs, "loginom-ai-agent.log"), "timestamp=2026-10-12T12:00:00.000Z level=Error message=sk-logsecretkeyvalue12\n"),
      )
      yield* Effect.promise(() =>
        writeFile(
          join(profileLogs, "huge.log"),
          `HUGE_HEAD_MARKER\n${"padding\n".repeat(200_000)}HUGE_TAIL_MARKER\n`,
        ),
      )
      const old = join(profileLogs, "old.log")
      yield* Effect.promise(() => writeFile(old, "OLDLOGMARKER\n"))
      const expired = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      yield* Effect.promise(() => utimes(old, expired, expired))
      yield* Effect.promise(() =>
        writeFile(join(run, "main.log"), "[2026-10-12 12:00:00.000] [error] password=log-secret-password-value\n"),
      )
      yield* Effect.promise(() =>
        writeFile(join(run, "crash.log"), "[2026-10-12 12:00:01.000] [error] previous session ended unexpectedly\n"),
      )
      yield* Effect.promise(() => writeFile(join(run, "network.netlog"), "NETLOGSECRETBYTES\n"))

      const session = yield* sessions.create({})
      const messageID = MessageID.ascending()
      yield* sessions.updateMessage({
        id: messageID,
        sessionID: session.id,
        role: "user",
        agent: agent.name,
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
        time: { created: Date.now() },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID,
        type: "text",
        text: "token=chat-secret-token-value https://user:pass@example.test/path eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID,
        type: "file",
        mime: "text/csv",
        filename: "rows.csv",
        url:
          "data:text/csv," +
          ["code;token=attachment-secret-token-value", ...Array.from({ length: 19 }, (_, index) => `row-${index};1`), "LINE21_MUST_STAY_OUT"].join("\n"),
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID,
        type: "file",
        mime: "application/octet-stream",
        filename: "blob.bin",
        url: "data:application/octet-stream;base64," + Buffer.from("DATAURLSECRETBYTES").toString("base64"),
      })
      const assistant = MessageID.ascending()
      yield* sessions.updateMessage({
        id: assistant,
        sessionID: session.id,
        role: "assistant",
        parentID: messageID,
        agent: agent.name,
        mode: agent.name,
        path: { cwd: session.directory, root: session.directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test-model"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: Date.now() },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistant,
        sessionID: session.id,
        type: "tool",
        tool: "loginom_dock_prepare",
        callID: "call-loginom",
        state: {
          status: "error",
          input: {},
          error: "LOGINOM_CONNECTION_NOT_READY: connection failed",
          time: { start: 1, end: 2 },
        },
      })
      const requests: { permission: string }[] = []
      const ctx: Tool.Context = {
        sessionID: session.id,
        messageID,
        agent: agent.name,
        abort: AbortSignal.any([]),
        messages: [],
        metadata: () => Effect.void,
        ask: (request) =>
          Effect.sync(() => {
            requests.push(request)
          }),
      }
      const info = yield* BugReportTool
      const tool = yield* info.init()
      const rejected = yield* tool.execute({ operation: "collect", hours: 0 }, ctx).pipe(Effect.exit)
      expect(Exit.isFailure(rejected)).toBe(true)

      const collected = JSON.parse((yield* tool.execute({ operation: "collect" }, ctx)).output)
      expect(collected.directory.startsWith(join(instance.directory, ".work", "bug-report"))).toBe(true)
      expect(collected.redactions).toBeGreaterThan(0)
      expect(requests.map((request) => request.permission)).toEqual([
        "external_directory",
        "external_directory",
        "read",
        "edit",
      ])
      const index = yield* fs.readJson(collected.index)
      expect(index).toMatchObject({
        chatErrors: [
          expect.objectContaining({
            callID: "call-loginom",
            tool: "loginom_dock_prepare",
            code: "LOGINOM_CONNECTION_NOT_READY",
          }),
        ],
      })
      const findings = recordList(index, "logFindings")
      expect(findings.some((item) => item.file === "logs/profile/loginom-ai-agent.log" && item.level === "error")).toBe(true)
      expect(findings.some((item) => item.file === "logs/desktop/20261012T120000/main.log" && item.level === "error")).toBe(true)
      expect(recordList(index, "crashNotes").some((item) => String(item.excerpt).includes("previous session"))).toBe(true)
      expect(recordList(index, "omitted").some((item) => item.reason === "netlog")).toBe(true)
      expect(recordList(index, "truncated").some((item) => item.file === "logs/profile/huge.log" && Number(item.lineOffset) > 0)).toBe(true)
      const copiedHuge = yield* fs.readFileString(join(collected.logs, "profile", "huge.log"))
      expect(copiedHuge).toContain("HUGE_TAIL_MARKER")
      expect(copiedHuge).not.toContain("HUGE_HEAD_MARKER")
      expect(Buffer.byteLength(copiedHuge)).toBeLessThanOrEqual(1024 * 1024)
      const chat = yield* fs.readFileString(collected.chat)
      const chatName = session.id + ".json"
      expect(collected.chat.endsWith(chatName)).toBe(true)
      const previews = fileParts(chat).flatMap((part) => (typeof part.preview === "string" ? [part.preview] : []))
      expect(previews).toHaveLength(1)
      expect(previews[0]?.split("\n")).toHaveLength(20)
      expect(previews[0]).toContain("code;token=[redacted]")
      expect(previews[0]).not.toContain("LINE21_MUST_STAY_OUT")
      expect(chat).toContain("omitted:data;mime=text/csv;bytes=")
      expect(chat).toContain("omitted:data;mime=application/octet-stream;bytes=")
      expect(chat).not.toContain("DATAURLSECRETBYTES")
      expect(chat).not.toContain("OLDLOGMARKER")
      if (session.directory.startsWith(homedir())) {
        expect(chat).toContain("<HOME>")
        expect(chat).not.toContain(homedir())
      }

      const incomplete = yield* tool.execute({ operation: "pack" }, ctx).pipe(Effect.exit)
      expect(Exit.isFailure(incomplete)).toBe(true)
      const report = (yield* fs.readFileString(collected.report)).replace(/PLACEHOLDER_[A-Z0-9_]+/g, "Описание.")
      yield* fs.writeFileString(collected.report, report)
      const packed = JSON.parse((yield* tool.execute({ operation: "pack" }, ctx)).output)
      const firstBytes = yield* fs.readFile(packed.output)
      const again = JSON.parse((yield* tool.execute({ operation: "pack", include: { chat: false, logs: true } }, ctx)).output)
      expect(again.output).not.toBe(packed.output)
      expect(yield* fs.readFile(packed.output)).toEqual(firstBytes)
      const secondBytes = yield* fs.readFile(again.output)
      const first = yield* Effect.promise(() => unzipBytes(firstBytes))
      const second = yield* Effect.promise(() => unzipBytes(secondBytes))
      expect([...first.keys()].toSorted()).toEqual(
        [chatName, "environment.json", "index.json", "logs/desktop/20261012T120000/crash.log", "logs/desktop/20261012T120000/main.log", "logs/profile/huge.log", "logs/profile/loginom-ai-agent.log", "manifest.json", "report.md"].toSorted(),
      )
      expect(second.has(chatName)).toBe(false)
      expect(second.has("logs/profile/loginom-ai-agent.log")).toBe(true)
      expect(first.get("report.md")).toContain("Описание.")
      expect(first.get("report.md")).not.toContain("PLACEHOLDER_")
      const combined = [...first.values(), ...second.values()].join("\n")
      for (const secret of secrets) expect(combined).not.toContain(secret)
      expect(combined).not.toContain("OLDLOGMARKER")
      expect(combined).not.toContain("NETLOGSECRETBYTES")
      expect(packed.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(packed.files).toContain("manifest.json")
      expect(packed.files).toContain(chatName)
      expect(again.files).not.toContain(chatName)
    }),
  60_000,
)

test("bug-report skill ships its instructions and report template", async () => {
  expect(await Bun.file(join(productSkillsDirectory, "bug-report/SKILL.md")).text()).toContain("name: bug-report")
  expect(await Bun.file(join(productSkillsDirectory, "bug-report/references/report-template.md")).text()).toContain(
    "PLACEHOLDER_SUMMARY",
  )
})

const availability = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([
        Agent.node,
        Session.node,
        SessionProjector.node,
        ToolRegistry.node,
        FSUtil.node,
        AppProcess.node,
        Permission.node,
        Plugin.node,
        MCP.node,
        Truncate.node,
        RuntimeFlags.node,
      ]),
      [
        [RuntimeFlags.node, RuntimeFlags.layer()],
        [
          Config.node,
          TestConfig.layer({
            directories: () => InstanceState.directory.pipe(Effect.map((dir) => [dir + "/.loginom-ai-agent"])),
          }),
        ],
      ],
    ),
    testInstanceStoreLayer,
  ),
)

availability.instance("registers bug_report_run outside the package-docs allowlist", () =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    expect(yield* registry.ids()).toContain("bug_report_run")
    for (const profile of ["default", "package-docs", "loginom-automation"] as const) {
      const tools = yield* toolsFor(profile)
      expect(Boolean(tools.bug_report_run)).toBe(profile !== "package-docs")
    }
  }),
)

const toolsFor = Effect.fn("bug-report.test.toolsFor")(function* (profile: TaskScope.Profile) {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const agent = yield* agents.get("build")
  const session = yield* sessions.create({ permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  const user = MessageID.ascending()
  const applied = MessageID.ascending()
  yield* sessions.updateMessage({
    id: user,
    sessionID: session.id,
    role: "user",
    agent: agent.name,
    model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
    time: { created: 1 },
  })
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: user,
    sessionID: session.id,
    type: "text",
    text: "Report the problem",
  })
  const assistant: SessionV1.Assistant = {
    id: applied,
    sessionID: session.id,
    role: "assistant",
    parentID: user,
    agent: agent.name,
    mode: agent.name,
    path: { cwd: session.directory, root: session.directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ModelV2.ID.make("test-model"),
    providerID: ProviderV2.ID.make("test"),
    time: { created: 2 },
  }
  yield* sessions.updateMessage(assistant)
  if (profile !== "default")
    yield* sessions.updatePart({
      id: PartID.ascending(),
      messageID: applied,
      sessionID: session.id,
      type: "tool",
      tool: "skill",
      callID: "applied-skill",
      state: {
        status: "completed",
        input: { name: profile },
        output: "loaded",
        title: "Loaded skill",
        metadata: { activation: { name: profile, profile, digest: "a".repeat(64) } },
        time: { start: 2, end: 2 },
      },
    })
  const history = yield* sessions.messages({ sessionID: session.id })
  return yield* SessionTools.resolve({
    agent,
    session,
    history,
    messages: history,
    model: { providerID: ProviderV2.ID.make("test"), api: { id: "test-model" } } as Provider.Model,
    processor: {
      message: assistant,
      updateToolCall: () => Effect.die("unexpected execution"),
      completeToolCall: () => Effect.void,
    },
    bypassAgentCheck: false,
    promptOps: {} as never,
  })
})

function fileParts(chat: string) {
  const parsed = JSON.parse(chat) as { messages?: { parts?: unknown[] }[] }
  return (parsed.messages ?? []).flatMap((message) =>
    (message.parts ?? []).flatMap((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return []
      const record = part as Record<string, unknown>
      if (record.type !== "file") return []
      return [record]
    }),
  )
}

function recordList(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const item = (value as Record<string, unknown>)[key]
  if (!Array.isArray(item)) return []
  return item.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry))
}

async function unzipBytes(bytes: Uint8Array) {
  const reader = new ZipReader(new BlobReader(new Blob([new Uint8Array(bytes)])))
  const entries = await reader.getEntries()
  const files = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.getData) continue
    const data = await entry.getData(new TextWriter())
    if (typeof data === "string") files.set(entry.filename, data)
  }
  await reader.close()
  return files
}
