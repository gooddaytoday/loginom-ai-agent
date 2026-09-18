import { expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { agentCommand, failureKind, parseEvents, runAgent } from "../src/cli"
import { evalsRoot, loadConfig } from "../src/config"

const fixture = (name: string) => Bun.file(path.join(evalsRoot, "fixtures", name)).text()
const fakeCommand = () => agentCommand(loadConfig(["--dry-run"], {}))

test("parseEvents: сессия, квитанция сохранения, узлы, текст, стоимость", async () => {
  const parsed = parseEvents(await fixture("fake/group-sum-qty.jsonl"))
  expect(parsed.sessionId).toBe("ses_fixture01")
  expect(parsed.saveReceipts).toEqual(["/user/fixture-group-sum-qty.lgp"])
  expect(parsed.nodeReceipts).toHaveLength(1)
  expect(parsed.nodeReceipts[0]).toContain('"row_count":2')
  expect(parsed.actionManifestSha256).toBe("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
  expect(parsed.finalText).toBe("Пакет сохранён: /user/fixture-group-sum-qty.lgp")
  expect(parsed.cost).toBeCloseTo(0.0123)
  expect(parsed.tokens).toEqual({ input: 1200, output: 300, reasoning: 0 })
  expect(parsed.errors).toEqual([])
  expect(parsed.counters).toEqual({ toolCalls: 3, loginomToolCalls: 3, toolErrors: 0, memoryToolCalls: 0 })
  expect(parsed.tools[2]).toMatchObject({ tool: "loginom_dock_action_run", status: "completed", action: "package.save_as" })
  expect(parsed.tools[1]).toMatchObject({ tool: "loginom_dock_node_apply", target: "transform.group_data" })
})

test("parseEvents: ошибочная фикстура даёт имена ошибок и счётчик toolErrors", async () => {
  const parsed = parseEvents(await fixture("fake/filter-active-rows.jsonl"))
  expect(parsed.errors).toEqual(["CLI_TOOL_FAILED"])
  expect(parsed.saveReceipts).toEqual([])
  expect(parsed.counters.toolErrors).toBe(1)
})

test("parseEvents: preflight-ошибка без sessionID", async () => {
  const parsed = parseEvents(await fixture("events/preflight-error.jsonl"))
  expect(parsed.sessionId).toBeUndefined()
  expect(parsed.errors).toEqual(["LOGINOM_CONFIG_REQUIRED"])
})

test("failureKind: приоритет permission → recovery → cancelled → provider → tool → other", () => {
  const base = { exitCode: 1, errors: [] as string[], errorTexts: [] as string[], stderr: "" }
  expect(failureKind({ ...base, errors: ["CLI_PERMISSION_REJECTED", "CLI_TOOL_FAILED"] })).toBe("permission")
  expect(failureKind({ ...base, exitCode: 4 })).toBe("recovery")
  expect(failureKind({ ...base, exitCode: 130 })).toBe("cancelled")
  expect(failureKind({ ...base, errorTexts: ["APIError status 429 rate limit"] })).toBe("provider")
  expect(failureKind({ ...base, stderr: "ProviderAuthError: token expired" })).toBe("provider")
  expect(failureKind({ ...base, stderr: "connect ECONNRESET to dock" })).toBe("other")
  expect(failureKind({ ...base, errorTexts: ["tool status 4000ms"] })).toBe("other")
  expect(failureKind({ ...base, errors: ["CLI_TOOL_FAILED"] })).toBe("tool")
  expect(failureKind(base)).toBe("other")
})

test("agentCommand: fake-режим указывает на fixtures/fake-cli.ts и изолирует окружение", () => {
  const config = loadConfig(["--dry-run"], {})
  const command = agentCommand(config, { ...process.env, LOGINOM_AI_AGENT_LEAK: "x", PATH: process.env.PATH ?? "" })
  expect(command.cmd[0]).toBe("bun")
  expect(command.cmd[1]?.endsWith("fixtures/fake-cli.ts")).toBe(true)
  expect(command.env.LOGINOM_AI_AGENT_CLI_PROFILE).toBe(config.profileDir)
  expect(command.env.LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG).toBe("1")
  expect(command.env.LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT).toBe("1")
  expect(command.env.LOGINOM_AI_AGENT_PURE).toBe("1")
  expect(command.env.LOGINOM_AI_AGENT_LEAK).toBeUndefined()
  expect(Object.keys(command.env).filter((key) => key.startsWith("LOGINOM_AI_AGENT_")).sort()).toEqual([
    "LOGINOM_AI_AGENT_CLI_PROFILE",
    "LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT",
    "LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG",
    "LOGINOM_AI_AGENT_PURE",
  ])
})

test("agentCommand: source-режим запускает standalone.ts из packages/agent с bundle", () => {
  const command = agentCommand(loadConfig([], { LOGINOM_DOCK_API_KEY: "k", EVAL_AGENT_MODEL: "m/x", JUDGE_MODEL: "j" }))
  expect(command.cmd).toEqual(["bun", "run", "src/standalone.ts"])
  expect(command.cwd.endsWith(path.join("packages", "agent"))).toBe(true)
  expect(command.env.LOGINOM_AI_AGENT_CLI_BUNDLE?.endsWith(".bundle")).toBe(true)
})

test("runAgent: fake CLI — события на диске, квитанция, код 0", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const run = await runAgent({
    command: fakeCommand(),
    taskId: "group-sum-qty",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 30_000,
    outDir,
  })
  expect(run.exitCode).toBe(0)
  expect(run.timedOut).toBe(false)
  expect(run.saveReceipts).toEqual(["/user/fixture-group-sum-qty.lgp"])
  expect(await Bun.file(path.join(outDir, "events.jsonl")).exists()).toBe(true)
  expect(await Bun.file(path.join(outDir, "run.json")).exists()).toBe(true)
  expect(run.durationMs).toBeGreaterThanOrEqual(0)
})

test("runAgent: код выхода 1 и failureKind=tool из фикстуры", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const run = await runAgent({
    command: fakeCommand(),
    taskId: "filter-active-rows",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 30_000,
    outDir,
  })
  expect(run.exitCode).toBe(1)
  expect(run.failureKind).toBe("tool")
})

test("runAgent: таймаут останавливает процесс и помечает timedOut", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const command = fakeCommand()
  const run = await runAgent({
    command: { ...command, env: { ...command.env, EVAL_FAKE_SLEEP_MS: "10000" } },
    taskId: "group-sum-qty",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 300,
    outDir,
  })
  expect(run.timedOut).toBe(true)
  expect(run.durationMs).toBeLessThan(5_000)
}, 15_000)

test("runAgent: уже отменённый AbortSignal не спавнит агента", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const command = fakeCommand()
  const controller = new AbortController()
  controller.abort()
  const run = await runAgent({
    command: { ...command, env: { ...command.env, EVAL_FAKE_SLEEP_MS: "10000" } },
    taskId: "group-sum-qty",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 30_000,
    outDir,
    signal: controller.signal,
  })
  expect(run.interrupted).toBe(true)
  expect(run.durationMs).toBeLessThan(2_000)
}, 15_000)

test("runAgent: abort через AbortSignal помечает interrupted", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const command = fakeCommand()
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 200)
  const run = await runAgent({
    command: { ...command, env: { ...command.env, EVAL_FAKE_SLEEP_MS: "10000" } },
    taskId: "group-sum-qty",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 30_000,
    outDir,
    signal: controller.signal,
  })
  expect(run.interrupted).toBe(true)
  expect(run.timedOut).toBe(false)
}, 15_000)
