import { expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { agentCommand, failureKind, parseEvents, runAgent } from "../src/cli"
import { evalsRoot, loadConfig } from "../src/config"

const fixture = (name: string) => Bun.file(path.join(evalsRoot, "fixtures", name)).text()
const fakeCommand = () => agentCommand(loadConfig(["--dry-run"], {}))

test("parseEvents: квитанция сохранения читается из последовательности JSON-документов", () => {
  const output = '{"output":{"package_ref":{"path":"/user/eval-run-task-1.lgp"}}}\n{"status":"ok"}\n{"trace":{"note":"literal } and \\\" quote"}}'
  const parsed = parseEvents(JSON.stringify({ type: "tool_use", part: {
    type: "tool", tool: "loginom_dock_action_run", state: {
      status: "completed", input: { action_key: "package.save_as" }, output,
    },
  } }))
  expect(parsed.saveReceipts).toEqual(["/user/eval-run-task-1.lgp"])
})

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
  expect(parsed.errors).toEqual(["LOGINOM_RECOVERY_REQUIRED"])
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

test("agentCommand: из env-override выкидывает LOGINOM_/EVAL_/JUDGE_/FAKE_CODEX_ и оставляет PATH", () => {
  const command = agentCommand(loadConfig(["--dry-run"], {}), {
    ...process.env,
    LOGINOM_DOCK_API_KEY: "leak",
    EVAL_X: "leak",
    PATH: "p",
  })
  expect(command.env.LOGINOM_DOCK_API_KEY).toBeUndefined()
  expect(command.env.EVAL_X).toBeUndefined()
  expect(command.env.PATH).toBe("p")
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

test("runAgent: no_artifact закрывает наблюдённого detached потомка и сохраняет исход", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-detached-"))
  const command = fakeCommand()
  const pidFile = path.join(outDir, "child.pid")
  try {
    const run = await runAgent({ command: { ...command, env: { ...command.env,
      EVAL_FAKE_ORPHAN_PID_FILE: pidFile, EVAL_FAKE_DETACHED_CHILD: "1", EVAL_FAKE_EXIT_DELAY_MS: "600" } },
      taskId: "default", model: "fake/model", prompt: "test", files: [],
      workdir: outDir, timeoutMs: 30_000, outDir })
    const pid = Number(await Bun.file(pidFile).text())
    const state = (await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()
    expect(run.exitCode).toBe(0)
    expect(run.sessionId).toBe("ses_fixture03")
    expect(run.tokens.input).toBe(400)
    expect(run.saveReceipts).toEqual([])
    expect(state === "" || state.startsWith("Z")).toBe(true)
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.processCleanup.processes.some((entry) => entry.pid === pid)).toBe(true)
  } finally {
    if (await Bun.file(pidFile).exists()) {
      try { process.kill(Number(await Bun.file(pidFile).text()), "SIGKILL") } catch {}
    }
  }
}, 15_000)

test("runAgent: явно передаёт выбранный reasoning variant", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-variant-"))
  const command = fakeCommand()
  const argsFile = path.join(outDir, "args.json")
  await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_ARGS_FILE: argsFile } },
    taskId: "group-sum-qty", model: "fake/model", variant: "low", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 30_000, outDir, profileDir: outDir })
  const args = await Bun.file(argsFile).json()
  expect(args.slice(args.indexOf("--variant"), args.indexOf("--variant") + 2)).toEqual(["--variant", "low"])
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

test("runAgent: после exit 1 завершает дочерний host без пути профиля в argv", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-orphan-"))
  const command = fakeCommand()
  const pidFile = path.join(outDir, "child.pid")
  try {
    const run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_ORPHAN_PID_FILE: pidFile } },
      taskId: "filter-active-rows", model: "fake/model", prompt: "test", files: [],
      workdir: outDir, timeoutMs: 30_000, outDir })
    const pid = Number(await Bun.file(pidFile).text())
    const state = (await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()
    expect(run.exitCode).toBe(1)
    expect(state === "" || state.startsWith("Z")).toBe(true)
  } finally {
    if (await Bun.file(pidFile).exists()) {
      const pid = Number(await Bun.file(pidFile).text())
      try { process.kill(pid, "SIGKILL") } catch {}
    }
  }
}, 15_000)

test("runAgent: регистрирует активную группу профиля и снимает запись после cleanup", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-group-record-"))
  const command = fakeCommand()
  const marker = `${outDir}.process-group`
  const running = runAgent({ command: { ...command, env: { ...command.env,
    LOGINOM_AI_AGENT_CLI_PROFILE: outDir, EVAL_FAKE_SLEEP_MS: "300" } },
    taskId: "group-sum-qty", model: "fake/model", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 30_000, outDir, profileDir: outDir })
  try {
    for (let index = 0; index < 10 && !(await Bun.file(marker).exists()); index++) await Bun.sleep(10)
    expect(await Bun.file(marker).exists()).toBe(true)
  } finally { await running }
  expect(await Bun.file(marker).exists()).toBe(false)
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

test("parseEvents: записывает ревизию skill из квитанции сессии", () => {
  const parsed = parseEvents(JSON.stringify({ type: "tool_use", part: {
    type: "tool", tool: "loginom_dock_prepare", state: { status: "completed",
      output: '{"prepared":true,"skillRevision":"session-revision"}\n{"status":"ok"}' },
  } }))
  expect(parsed.skillRevision).toBe("session-revision")
})

test("runAgent: завершившийся CLI не становится timeout во время cleanup host", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-cleanup-budget-"))
  const command = fakeCommand()
  const run = await runAgent({ command: { ...command, env: { ...command.env,
    EVAL_FAKE_ORPHAN_PID_FILE: path.join(outDir, "child.pid"), EVAL_FAKE_CHILD_DELAY_MS: "800" } },
    taskId: "group-sum-qty", model: "fake/model", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 500, outDir })
  expect(run.exitCode).toBe(0)
  expect(run.timedOut).toBe(false)
})
