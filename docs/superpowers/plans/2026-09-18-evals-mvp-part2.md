# Eval Harness MVP — план реализации (часть 2: оркестратор, судья, режимы, приёмка)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Обязательный процесс разработки — skill `/tdd`**: один падающий тест → минимальная реализация → зелёный → коммит. Часть 1 (задачи 1–5, скелет, конфиг, задачи, CLI, артефакт, отчёт) — `docs/superpowers/plans/2026-09-18-evals-mvp.md`; её Global Constraints действуют здесь целиком.

**Spec:** `docs/superpowers/specs/2026-09-18-evals-design.md`.

**Interfaces из части 1, на которые опираются задачи ниже:** `loadConfig/EvalConfig/evalsRoot/repoRoot` (`config.ts`), `EvalFailure` (`fail.ts`), `loadTasks/Task/ChecklistItem/agentInputsHash/rubricHash` (`task.ts`), `agentCommand/AgentCommand/runAgent/AgentRun` (`cli.ts`), `parseArtifactSource/ArtifactSource/listStorage/unzip/fetchArtifact/Artifact/cleanupArtifact` (`artifact.ts`), `statusFor/AttemptResult/aggregate/aggregateTask/RunSummary/renderReport/writeSummary` (`report.ts`).

---

### Task 6: Окружение и eval-профиль (`preflight.ts`, `profile.ts`)

**Files:**
- Create: `evals/src/preflight.ts`, `evals/src/profile.ts`
- Test: `evals/test/preflight.test.ts`, `evals/test/profile.test.ts`

**Interfaces:**
- Produces (`preflight.ts`): `type Environment = { git: { sha; dirty } | null; codex: { version } | null; dock: { skillRevision: string | null } | null; loginom: { imageDigest: string | null } | null }`; `preflight(config, source) → Promise<Environment>`; `gitInfo() → Promise<{ sha; dirty } | null>`.
- Produces (`profile.ts`): `management(command, args, stdin?, timeoutMs?) → { exitCode, stdout, stderr }`; `parseView(text) → View | undefined`; `releaseStaleWriter(profileDir) → Promise<boolean>`; `waitProfileIdle(profileDir, timeoutMs?) → Promise<boolean>`; `agentConfigJson(config) → object`; `ensureProfile(config, command) → Promise<{ fresh }>`; `assertAuth(config, command) → Promise<void>`; `recoverIfNeeded(command, exitCode: 1 | 2) → Promise<{ recovered; view }>`; `resetProfile(config) → Promise<void>`.

- [ ] **Шаг 6.1 (RED): tracer bullet — `--dry-run` preflight ничего не требует, git читается**

`evals/test/preflight.test.ts`:

```ts
import { expect, test } from "bun:test"
import { loadConfig } from "../src/config"
import { parseArtifactSource } from "../src/artifact"
import { preflight } from "../src/preflight"

test("preflight: dry-run проверяет только фикстуры и читает git", async () => {
  const config = loadConfig(["--dry-run"], {})
  const environment = await preflight(config, parseArtifactSource(config.artifactSource, config.loginom))
  expect(environment.git?.sha).toMatch(/^[0-9a-f]{7,}$/)
  expect(environment.codex).toBeNull()
  expect(environment.dock).toBeNull()
  expect(environment.loginom).toBeNull()
})
```

Run: `bun test test/preflight.test.ts` → FAIL.

- [ ] **Шаг 6.2 (GREEN): `preflight.ts`**

```ts
import path from "node:path"
import os from "node:os"
import { mkdir, stat } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { evalsRoot, repoRoot } from "./config"
import { EvalFailure } from "./fail"
import type { ArtifactSource } from "./artifact"

export type Environment = {
  git: { sha: string; dirty: boolean } | null
  codex: { version: string } | null
  dock: { skillRevision: string | null } | null
  loginom: { imageDigest: string | null } | null
}

export async function preflight(config: EvalConfig, source: ArtifactSource): Promise<Environment> {
  const environment: Environment = { git: await gitInfo(), codex: null, dock: null, loginom: null }
  if (config.dryRun) {
    await requireFixtures()
    return environment
  }
  if (!config.skipJudge) environment.codex = await codexInfo(config.judge.command)
  // --judge-only и --calibrate не запускают агента: Loginom, docker, Dock и bundle не нужны.
  if (config.judgeOnly !== undefined || config.calibrate) return environment
  for (const tool of ["unzip", "git", "pgrep"]) {
    if (!Bun.which(tool)) throw new EvalFailure(`Не найдена команда ${tool}`, 2)
  }
  const page = await fetch(config.loginom.url, { signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
  if (page?.status !== 200)
    throw new EvalFailure(`Loginom недоступен: ${config.loginom.url} → ${page?.status ?? "нет ответа"}`, 2)
  if (source.kind === "docker") environment.loginom = { imageDigest: await containerDigest(source.container) }
  environment.dock = { skillRevision: await dockSkillRevision(config.dock) }
  if (config.agent.cliMode === "source") {
    for (const file of ["bin/node", "host/node-host.mjs"]) {
      if (!(await Bun.file(path.join(config.agent.bundle, file)).exists()))
        throw new EvalFailure(
          `Dev-bundle неполный: нет ${file} в ${config.agent.bundle}. Выполните: bun run prepare-bundle`,
          2,
        )
    }
  }
  if (config.agent.cliMode === "binary" && !(await Bun.file(config.agent.cliBin ?? "").exists()))
    throw new EvalFailure(`EVAL_CLI_BIN не найден: ${config.agent.cliBin}`, 2)
  await mkdir(config.agent.workspaceRoot, { recursive: true })
  return environment
}

export async function gitInfo() {
  const sha = await Bun.$`git rev-parse --short HEAD`.cwd(repoRoot).quiet().nothrow()
  if (sha.exitCode !== 0) return null
  const status = await Bun.$`git status --porcelain`.cwd(repoRoot).quiet().nothrow()
  return { sha: sha.text().trim(), dirty: status.text().trim().length > 0 }
}

async function codexInfo(command: string[]) {
  const version = await Bun.$`${command} --version`.quiet().nothrow()
  if (version.exitCode !== 0)
    throw new EvalFailure(`Судья недоступен: ${command.join(" ")} --version → код ${version.exitCode}`, 2)
  const home = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex")
  if (command[0] === "codex" && !(await Bun.file(path.join(home, "auth.json")).exists()))
    throw new EvalFailure(`Нет входа Codex: отсутствует ${path.join(home, "auth.json")}. Выполните: codex login`, 2)
  return { version: version.text().trim() }
}

async function containerDigest(container: string) {
  const format = "{{.State.Running}}\t{{.Image}}"
  const inspected = await Bun.$`docker inspect -f ${format} ${container}`.quiet().nothrow()
  if (inspected.exitCode !== 0)
    throw new EvalFailure(`Контейнер ${container} не найден: ${inspected.stderr.toString().trim()}`, 2)
  const [running, image] = inspected.text().trim().split("\t")
  if (running !== "true") throw new EvalFailure(`Контейнер ${container} не запущен`, 2)
  return image ?? null
}

async function dockSkillRevision(dock: { apiKey: string; baseUrl: string }) {
  const health = await fetch(`${dock.baseUrl}/health`, { signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
  if (health?.status !== 200)
    throw new EvalFailure(`Dock недоступен: ${dock.baseUrl}/health → ${health?.status ?? "нет ответа"}`, 2)
  const manifest = await fetch(`${dock.baseUrl}/api/v1/skills/loginom-automation`, {
    headers: { Authorization: `Bearer ${dock.apiKey}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
  if (manifest?.status === 401 || manifest?.status === 403)
    throw new EvalFailure("Dock отклонил LOGINOM_DOCK_API_KEY (401/403)", 2)
  if (manifest?.status !== 200)
    throw new EvalFailure(`Манифест skill недоступен: ${manifest?.status ?? "нет ответа"}`, 2)
  const body = (await manifest.json().catch(() => undefined)) as
    | { revision?: unknown; result?: { revision?: unknown } }
    | undefined
  const revision = body?.revision ?? body?.result?.revision
  return typeof revision === "string" || typeof revision === "number" ? String(revision) : null
}

async function requireFixtures() {
  for (const rel of ["fixtures/fake-cli.ts", "fixtures/fake/default.jsonl", "fixtures/storage"]) {
    if (!(await stat(path.join(evalsRoot, rel)).catch(() => undefined))) throw new EvalFailure(`Нет фикстуры ${rel}`, 2)
  }
}
```

Run: `bun test test/preflight.test.ts` → PASS.

- [ ] **Шаг 6.3 (RED→GREEN): режим `--judge-only` проверяет судью через `EVAL_JUDGE_COMMAND`**

Сначала фикстура `evals/fixtures/fake-codex.ts` (полная версия используется в задаче 8; здесь достаточно `--version`, но пишем сразу целиком):

```ts
import path from "node:path"

const args = Bun.argv.slice(2)
if (args[0] === "--version") {
  process.stdout.write("fake-codex 0.0.0\n")
  process.exit(0)
}
const dir = args[args.indexOf("-C") + 1] ?? "."
const out = args[args.indexOf("-o") + 1] ?? path.join(dir, "verdict.json")
// FAKE_CODEX_FLAKY_MARKER: первый вызов падает и создаёт маркер, второй проходит.
const marker = process.env.FAKE_CODEX_FLAKY_MARKER
if (marker && !(await Bun.file(marker).exists())) {
  await Bun.write(marker, "1")
  process.exit(1)
}
const exit = Number(process.env.FAKE_CODEX_EXIT ?? "0")
if (exit !== 0) process.exit(exit)
const mode = process.env.FAKE_CODEX_VERDICT ?? "pass" // pass | fail | half | invalid | file:<path>
if (mode === "invalid") {
  await Bun.write(out, "{not json")
  process.exit(0)
}
if (mode.startsWith("file:")) {
  await Bun.write(out, await Bun.file(mode.slice(5)).text())
  process.exit(0)
}
const checklist = (await Bun.file(path.join(dir, "checklist.json")).json()) as { id: string }[]
const passed = (index: number) => (mode === "pass" ? true : mode === "fail" ? false : index % 2 === 0)
await Bun.write(
  out,
  JSON.stringify({
    checklist: checklist.map((item, index) => ({ id: item.id, passed: passed(index), evidence: `fake ${mode}` })),
    summary: `fake verdict (${mode})`,
    confidence: "high",
  }),
)
```

Тест:

```ts
import path from "node:path"
import { evalsRoot } from "../src/config"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("preflight: --judge-only проверяет только судью и не трогает Loginom/docker", async () => {
  const config = loadConfig(["--judge-only", "run-1"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge })
  const environment = await preflight(config, parseArtifactSource("docker", config.loginom))
  expect(environment.codex?.version).toBe("fake-codex 0.0.0")
  expect(environment.loginom).toBeNull()
})

test("preflight: недоступный судья — EvalFailure", async () => {
  const config = loadConfig(["--judge-only", "run-1"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "/nonexistent/codex" })
  await expect(preflight(config, parseArtifactSource("docker", config.loginom))).rejects.toThrow("Судья недоступен")
})
```

Run: `bun test test/preflight.test.ts` → PASS (реализация 6.2 покрывает; при падении — минимальная правка).

- [ ] **Шаг 6.4 (RED): tracer bullet профиля — `releaseStaleWriter`**

`evals/test/profile.test.ts`:

```ts
import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import { releaseStaleWriter } from "../src/profile"

test("releaseStaleWriter: снимает .writer без процессов, без .writer возвращает false", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-"))
  expect(await releaseStaleWriter(profile)).toBe(false)
  await mkdir(path.join(profile, ".writer"))
  await writeFile(path.join(profile, ".writer", "nonce"), "x")
  expect(await releaseStaleWriter(profile)).toBe(true)
  expect(await stat(path.join(profile, ".writer")).catch(() => undefined)).toBeUndefined()
})
```

Run: `bun test test/profile.test.ts` → FAIL.

- [ ] **Шаг 6.5 (GREEN): `profile.ts` — первая версия**

```ts
import path from "node:path"
import { mkdir, rm, stat } from "node:fs/promises"
import type { EvalConfig } from "./config"
import type { AgentCommand } from "./cli"
import { EvalFailure } from "./fail"

type View = { state: string; recoveries?: string[]; failure?: string; hasApiKey?: boolean }

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  )

export async function management(command: AgentCommand, args: string[], stdin?: string, timeoutMs = 120_000) {
  const proc = Bun.spawn([...command.cmd, ...args], {
    cwd: command.cwd,
    env: command.env,
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs)
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const exitCode = await proc.exited
  clearTimeout(timer)
  return { exitCode, stdout, stderr }
}

export function parseView(text: string): View | undefined {
  const lines = text.trim().split("\n")
  const parsed = parseJson(lines[lines.length - 1] ?? "")
  return typeof parsed === "object" && parsed !== null && typeof (parsed as View).state === "string"
    ? (parsed as View)
    : undefined
}

// Guard снимаем только когда ни один процесс не ссылается на профиль (Chromium держит путь в argv).
export async function releaseStaleWriter(profileDir: string) {
  const writer = path.join(profileDir, ".writer")
  if (!(await exists(writer))) return false
  const busy = await Bun.$`pgrep -f ${profileDir}`.quiet().nothrow()
  if (busy.exitCode === 0) throw new EvalFailure(`Профиль ${profileDir} занят процессами:\n${busy.text().trim()}`, 2)
  await rm(writer, { recursive: true, force: true })
  return true
}

export async function waitProfileIdle(profileDir: string, timeoutMs = 60_000) {
  await Bun.$`pkill -TERM -f ${profileDir}`.quiet().nothrow()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const busy = await Bun.$`pgrep -f ${profileDir}`.quiet().nothrow()
    if (busy.exitCode !== 0) return true
    await Bun.sleep(2_000)
  }
  return false
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
```

Run: `bun test test/profile.test.ts` → PASS.

- [ ] **Шаг 6.6 (RED→GREEN): `agentConfigJson`, `ensureProfile` через fake CLI**

Тест-хелпер и тесты:

```ts
import { loadConfig } from "../src/config"
import { agentCommand } from "../src/cli"
import { agentConfigJson, ensureProfile } from "../src/profile"

const fakeProfile = async (env: Record<string, string> = {}) => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "evals-profile-"))
  const config = { ...loadConfig(["--dry-run"], {}), profileDir, dock: { apiKey: "eval-dock-key", baseUrl: "https://x" } }
  const command = agentCommand(config)
  return { config, command: { ...command, env: { ...command.env, ...env } }, profileDir }
}

test("agentConfigJson: разрешает loginom_* и описывает OpenAI-compatible провайдер", () => {
  const base = loadConfig(["--dry-run"], {})
  expect(agentConfigJson(base)).toEqual({ permission: { "loginom_*": "allow" } })
  const withProvider = { ...base, agent: { ...base.agent, provider: { id: "xiaomi", baseUrl: "https://api", apiKey: "k", modelId: "mimo" } } }
  const json = agentConfigJson(withProvider) as { provider: Record<string, { options: { apiKey: string; baseURL: string }; models: Record<string, unknown> }> }
  expect(json.provider.xiaomi?.options).toEqual({ apiKey: "k", baseURL: "https://api" })
  expect(Object.keys(json.provider.xiaomi?.models ?? {})).toEqual(["mimo"])
})

test("ensureProfile: первый вызов делает setup и пишет config, второй — только config", async () => {
  const { config, command, profileDir } = await fakeProfile()
  expect((await ensureProfile(config, command)).fresh).toBe(true)
  expect(await Bun.file(path.join(profileDir, "cli-profile.json")).exists()).toBe(true)
  const written = await Bun.file(path.join(profileDir, "config", "loginom-ai-agent.json")).json()
  expect(written.permission).toEqual({ "loginom_*": "allow" })
  expect((await ensureProfile(config, command)).fresh).toBe(false)
})
```

Добавить в `profile.ts`:

```ts
export function agentConfigJson(config: EvalConfig) {
  const provider = config.agent.provider
  return {
    permission: { "loginom_*": "allow" },
    ...(provider
      ? {
          provider: {
            [provider.id]: {
              name: provider.id,
              id: provider.id,
              env: [],
              npm: "@ai-sdk/openai-compatible",
              models: {
                [provider.modelId]: {
                  id: provider.modelId,
                  name: provider.modelId,
                  attachment: false,
                  reasoning: false,
                  temperature: false,
                  tool_call: true,
                  release_date: "2025-01-01",
                  limit: { context: 200_000, output: 32_000 },
                  cost: { input: 0, output: 0 },
                  options: {},
                },
              },
              options: { apiKey: provider.apiKey, baseURL: provider.baseUrl },
            },
          },
        }
      : {}),
  }
}

export async function ensureProfile(config: EvalConfig, command: AgentCommand) {
  await mkdir(config.profileDir, { recursive: true, mode: 0o700 })
  const fresh = !(await exists(path.join(config.profileDir, "cli-profile.json")))
  if (fresh) {
    const setup = await management(
      command,
      ["loginom", "setup", "--stdin-json", "--format", "json"],
      JSON.stringify({
        url: config.loginom.url,
        username: config.loginom.username,
        password: config.loginom.password,
        apiKey: config.dock.apiKey,
      }),
    )
    if (setup.stdout.includes(config.dock.apiKey) || setup.stderr.includes(config.dock.apiKey))
      throw new EvalFailure("Секрет попал в вывод loginom setup", 2)
    if (setup.exitCode !== 0)
      throw new EvalFailure(`loginom setup завершился кодом ${setup.exitCode}:\n${setup.stderr.trim()}`, 2)
  }
  await Bun.write(
    path.join(config.profileDir, "config", "loginom-ai-agent.json"),
    JSON.stringify(agentConfigJson(config), null, 2),
  )
  return { fresh }
}
```

Run: `bun test test/profile.test.ts` → PASS.

- [ ] **Шаг 6.7 (RED→GREEN): `assertAuth`**

```ts
import { assertAuth } from "../src/profile"

test("assertAuth: без auth.json — EvalFailure с командой providers login; с записью провайдера — ок", async () => {
  const { config, command, profileDir } = await fakeProfile()
  const openai = { ...config, agent: { ...config.agent, model: "openai/gpt-5.6-sol" } }
  await expect(assertAuth(openai, command)).rejects.toThrow("providers login")
  await mkdir(path.join(profileDir, "data"), { recursive: true })
  await writeFile(path.join(profileDir, "data", "auth.json"), JSON.stringify({ openai: { type: "oauth" } }))
  await assertAuth(openai, command)
  const viaProvider = { ...config, agent: { ...config.agent, model: "xiaomi/mimo", provider: { id: "xiaomi", baseUrl: "u", apiKey: "k", modelId: "mimo" } } }
  await assertAuth(viaProvider, command)
})
```

Добавить в `profile.ts`:

```ts
export async function assertAuth(config: EvalConfig, command: AgentCommand) {
  const providerId = config.agent.model.split("/")[0] ?? ""
  if (config.agent.provider?.id === providerId) return
  const file = Bun.file(path.join(config.profileDir, "data", "auth.json"))
  const entries = (await file.exists()) ? ((await file.json()) as Record<string, unknown>) : {}
  if (providerId in entries) return
  const envLine = Object.entries(command.env)
    .filter(([key]) => key.startsWith("LOGINOM_AI_AGENT_CLI_"))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")
  throw new EvalFailure(
    `Нет авторизации провайдера "${providerId}" в eval-профиле ${config.profileDir}.\n` +
      `Выполните один раз:\n  cd ${command.cwd} && ${envLine} ${command.cmd.join(" ")} providers login\n` +
      "или задайте EVAL_AGENT_PROVIDER_* в evals/.env.",
    2,
  )
}
```

Run: `bun test test/profile.test.ts` → PASS.

- [ ] **Шаг 6.8 (RED→GREEN): `recoverIfNeeded` и `resetProfile`**

```ts
import { recoverIfNeeded, resetProfile } from "../src/profile"
import { EvalFailure } from "../src/fail"

const stateFile = async (view: object) => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), "evals-state-")), "view.json")
  await writeFile(file, JSON.stringify(view))
  return file
}

test("recoverIfNeeded: непустые recoveries → acknowledge → ready", async () => {
  const file = await stateFile({ state: "ready", recoveries: ["op-1"] })
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: file })
  const result = await recoverIfNeeded(command, 1)
  expect(result.recovered).toBe(true)
  expect(result.view.state).toBe("ready")
  expect((await Bun.file(file).json()).recoveries).toEqual([])
})

test("recoverIfNeeded: ready без recoveries — ничего не делает", async () => {
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: await stateFile({ state: "ready" }) })
  expect((await recoverIfNeeded(command, 1)).recovered).toBe(false)
})

test("recoverIfNeeded: recoverable-error — EvalFailure с состоянием", async () => {
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: await stateFile({ state: "recoverable-error", failure: "LOGIN_FAILED" }) })
  await expect(recoverIfNeeded(command, 1)).rejects.toThrow("state=recoverable-error")
})

test("recoverIfNeeded: starting ожидается до ready", async () => {
  const file = await stateFile({ state: "starting" })
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: file })
  setTimeout(() => void writeFile(file, JSON.stringify({ state: "ready" })), 1_500)
  expect((await recoverIfNeeded(command, 1)).view.state).toBe("ready")
}, 15_000)

test("resetProfile: удаляет каталог профиля", async () => {
  const { config, profileDir } = await fakeProfile()
  await resetProfile(config)
  expect(await stat(profileDir).catch(() => undefined)).toBeUndefined()
})
```

Добавить в `profile.ts`:

```ts
export async function recoverIfNeeded(command: AgentCommand, exitCode: 1 | 2) {
  const first = await status(command, exitCode)
  const acknowledged = Boolean(first.recoveries?.length)
  if (acknowledged) {
    const recover = await management(command, ["loginom", "recover", "--acknowledge", "--format", "json"])
    if (recover.exitCode !== 0)
      throw new EvalFailure(`loginom recover завершился кодом ${recover.exitCode}:\n${recover.stderr.trim()}`, exitCode)
  }
  const view = await settle(command, acknowledged ? await status(command, exitCode) : first, exitCode)
  if (view.state !== "ready" || view.recoveries?.length)
    throw new EvalFailure(
      `Профиль Loginom не готов: state=${view.state} failure=${view.failure ?? "—"} recoveries=${view.recoveries?.length ?? 0}`,
      exitCode,
    )
  return { recovered: acknowledged, view }
}

export async function resetProfile(config: EvalConfig) {
  const busy = await Bun.$`pgrep -f ${config.profileDir}`.quiet().nothrow()
  if (busy.exitCode === 0)
    throw new EvalFailure(`Нельзя сбросить профиль: занят процессами\n${busy.text().trim()}`, 2)
  await rm(config.profileDir, { recursive: true, force: true })
}

async function status(command: AgentCommand, exitCode: 1 | 2) {
  const out = await management(command, ["loginom", "status", "--format", "json"])
  const view = parseView(out.stdout)
  if (!view)
    throw new EvalFailure(
      `loginom status не вернул состояние (код ${out.exitCode}):\n${out.stdout.trim()}\n${out.stderr.trim()}`,
      exitCode,
    )
  return view
}

// starting — транзитное состояние сразу после setup; ждём до 10 с повторными status.
async function settle(command: AgentCommand, view: View, exitCode: 1 | 2, deadline = Date.now() + 10_000): Promise<View> {
  if (view.state !== "starting" || Date.now() >= deadline) return view
  await Bun.sleep(1_000)
  return settle(command, await status(command, exitCode), exitCode, deadline)
}
```

Run: `bun test test/profile.test.ts` → PASS.

- [ ] **Шаг 6.9: коммит**

```bash
bun typecheck && bun test
git add evals/src/preflight.ts evals/src/profile.ts evals/fixtures/fake-codex.ts evals/test/preflight.test.ts evals/test/profile.test.ts
git commit -m "feat(evals): environment preflight and eval profile lifecycle"
```

---

### Task 7: Оркестратор `run.ts` — сквозной `--dry-run`

**Files:**
- Create: `evals/src/run.ts`
- Test: `evals/test/run.test.ts`

**Interfaces:**
- Produces: `main(argv) → Promise<{ code: number; runDir: string | null }>`; `runAttempt(input) → Promise<AttemptResult & { stop: boolean }>`; `installSigint(controller)`; `stamp(date) → "YYYYMMDD-HHmmss"`; `redact(config)`; `describe(error)`. Судья в этой задаче не подключён: при наличии артефакта `judge_status = "skipped"`, `score = null` (задача 8 заменит это вызовом судьи).

- [ ] **Шаг 7.1 (RED): tracer bullet — dry-run с двумя повторами**

`evals/test/run.test.ts`:

```ts
import { expect, test } from "bun:test"
import path from "node:path"
import { rm } from "node:fs/promises"
import { main } from "../src/run"
import type { RunSummary } from "../src/report"

test("main --dry-run --repeat 2: статусы по фикстурам, попытки в подпапках, summary без судьи", async () => {
  const result = await main(["--dry-run", "--repeat", "2", "--label", "dry"])
  expect(result.code).toBe(0)
  const runDir = result.runDir!
  const summary = (await Bun.file(path.join(runDir, "summary.json")).json()) as RunSummary
  expect(summary.label).toBe("dry")
  expect(summary.config.repeat).toBe(2)
  expect(summary.metrics.total).toBe(6)
  expect(summary.metrics.completed).toBe(2)
  expect(summary.metrics.mean_score).toBeNull()
  expect(summary.judge).toBeNull()
  const byTask = Object.fromEntries(summary.tasks.map((task) => [task.id, task]))
  expect(byTask["group-sum-qty"]!.attempts.map((item) => item.status)).toEqual(["completed", "completed"])
  expect(byTask["group-sum-qty"]!.attempts[0]!.artifact_origin).toBe("receipt")
  expect(byTask["group-sum-qty"]!.attempts[0]!.judge_status).toBe("skipped")
  expect(byTask["filter-active-rows"]!.attempts[0]).toMatchObject({ status: "failed", exit_code: 1, failure_kind: "tool", score: 0, judge_status: "no_artifact" })
  expect(byTask["calc-data-double"]!.attempts[0]).toMatchObject({ status: "no_artifact", score: 0, pass: false })
  expect(await Bun.file(path.join(runDir, "group-sum-qty", "2", "artifact", "package.lgp")).exists()).toBe(true)
  expect(await Bun.file(path.join(runDir, "group-sum-qty", "1", "prompt.txt")).text()).toContain("Сохрани готовый пакет как")
  expect(await Bun.file(path.join(runDir, "report.md")).exists()).toBe(true)
  const config = await Bun.file(path.join(runDir, "config.json")).json()
  expect(config.dock.apiKey).toBe("<unset>")
  await rm(runDir, { recursive: true, force: true })
}, 60_000)
```

Run: `bun test test/run.test.ts` → FAIL.

- [ ] **Шаг 7.2 (GREEN): `run.ts`**

```ts
import path from "node:path"
import { cp, mkdir } from "node:fs/promises"
import { loadConfig, type EvalConfig } from "./config"
import { EvalFailure } from "./fail"
import { agentInputsHash, loadTasks, rubricHash, type Task } from "./task"
import { agentCommand, runAgent, type AgentCommand } from "./cli"
import { cleanupArtifact, fetchArtifact, listStorage, parseArtifactSource, type ArtifactSource } from "./artifact"
import { preflight } from "./preflight"
import { assertAuth, ensureProfile, recoverIfNeeded, releaseStaleWriter, resetProfile, waitProfileIdle } from "./profile"
import { aggregate, aggregateTask, renderReport, statusFor, writeSummary, type AttemptResult, type RunSummary } from "./report"

export async function main(argv: string[]) {
  const config = loadConfig(argv)
  const tasks = await loadTasks(config.tasksDir, config.only)
  const source = parseArtifactSource(config.artifactSource, config.loginom)
  const environment = await preflight(config, source)
  const command = agentCommand(config)
  const controller = new AbortController()
  installSigint(controller)
  if (!config.dryRun) await prepareProfile(config, command)
  const startedAt = new Date()
  const runId = `${stamp(startedAt)}-${environment.git?.sha ?? "nogit"}${environment.git?.dirty ? "-dirty" : ""}`
  const runDir = path.join(config.resultsDir, runId)
  await mkdir(runDir, { recursive: true })
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify(redact(config), null, 2))
  const attempts: AttemptResult[] = []
  const state: { stopped: string | null; recovered: boolean; interruptedCleanup: { recovered: boolean } | null } = {
    stopped: null,
    recovered: false,
    interruptedCleanup: null,
  }
  // Round-robin: сбой окружения размазывается по задачам, Ctrl+C после первого круга оставляет полное покрытие.
  outer: for (const attempt of Array.from({ length: config.repeat }, (_, index) => index + 1)) {
    for (const task of tasks) {
      if (controller.signal.aborted) break outer
      const result = await runAttempt({
        config,
        command,
        source,
        task,
        attempt,
        runId,
        runDir,
        signal: controller.signal,
        profileRecovered: state.recovered,
      })
      attempts.push(result)
      console.error(`[${task.id}#${attempt}] ${result.status} score=${result.score ?? "—"} ${Math.round(result.duration_ms / 1000)}s`)
      if (result.status === "harness_error" && result.stop) {
        state.stopped = result.harness_error ?? "harness_error"
        break outer
      }
      if (!config.dryRun) {
        const after = await afterAttempt(config, command, result).catch((error: unknown) => ({ stop: describe(error) }))
        if ("stop" in after) {
          state.stopped = after.stop
          break outer
        }
        state.recovered = after.recovered
        if (result.status === "interrupted") state.interruptedCleanup = { recovered: after.recovered }
      }
      if (result.status === "interrupted") break outer
    }
  }
  const summary: RunSummary = {
    run_id: runId,
    label: config.label,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    interrupted: controller.signal.aborted,
    interrupted_cleanup: state.interruptedCleanup,
    stopped_reason: state.stopped,
    agent: {
      cli_mode: config.agent.cliMode,
      git_sha: environment.git?.sha ?? null,
      dirty: environment.git?.dirty ?? null,
      model: config.agent.model,
    },
    judge: null,
    dock: {
      skill_revision: environment.dock?.skillRevision ?? null,
      action_manifest_sha256: [...new Set(attempts.flatMap((item) => (item.action_manifest_sha256 ? [item.action_manifest_sha256] : [])))],
    },
    loginom: { image_digest: environment.loginom?.imageDigest ?? null },
    agent_inputs_hash: await agentInputsHash(tasks),
    rubric_hash: await rubricHash(tasks),
    task_ids: tasks.map((task) => task.id),
    config: {
      repeat: config.repeat,
      timeout_ms: config.timeoutMs ?? config.taskTimeoutMs,
      judge_timeout_ms: config.judgeTimeoutMs,
      pass_threshold: config.passThreshold,
      keep_storage: config.keepStorage,
    },
    metrics: aggregate(attempts, config.skipJudge),
    tasks: tasks.map((task) => {
      const own = attempts.filter((item) => item.task_id === task.id)
      return { id: task.id, metrics: aggregateTask(own, config.skipJudge), attempts: own }
    }),
    storage_leftovers: config.dryRun ? [] : await leftovers(source, runId),
  }
  await writeSummary(runDir, summary)
  console.log(renderReport(summary))
  console.error(`Результаты: ${runDir}`)
  return { code: state.stopped ? 1 : 0, runDir }
}

export async function runAttempt(input: {
  config: EvalConfig
  command: AgentCommand
  source: ArtifactSource
  task: Task
  attempt: number
  runId: string
  runDir: string
  signal: AbortSignal
  profileRecovered: boolean
}): Promise<AttemptResult & { stop: boolean }> {
  const base = emptyResult(input.task.id, input.attempt, input.profileRecovered)
  return attemptBody(input, base).catch((error: unknown) => ({
    ...base,
    status: "harness_error" as const,
    judge_status: "skipped" as const,
    harness_error: describe(error),
    stop: false,
  }))
}

async function attemptBody(input: Parameters<typeof runAttempt>[0], base: AttemptResult): Promise<AttemptResult & { stop: boolean }> {
  const { config, task, attempt } = input
  const outDir = path.join(input.runDir, task.id, String(attempt))
  const workdir = path.join(config.agent.workspaceRoot, input.runId, task.id, String(attempt))
  await mkdir(outDir, { recursive: true })
  await mkdir(workdir, { recursive: true })
  const files = await Promise.all(
    task.inputs.map(async (rel) => {
      const dest = path.join(workdir, path.basename(rel))
      await cp(path.join(task.dir, rel), dest)
      return dest
    }),
  )
  const name = `eval-${input.runId}-${task.id}-${attempt}`
  const packagePath = `/${config.loginom.username}/${name}.lgp`
  const prompt =
    `${task.prompt}\n\nСохрани готовый пакет как \`${packagePath}\`. ` +
    `Если задача требует выгрузку в файл, назови его \`${name}.result.csv\`. ` +
    "Уточняющих вопросов не задавай — принимай разумные решения самостоятельно и доведи задачу до конца."
  await Bun.write(path.join(outDir, "prompt.txt"), prompt)
  const since = Date.now()
  const run = await runAgent({
    command: input.command,
    taskId: task.id,
    model: config.agent.model,
    prompt,
    files,
    workdir,
    timeoutMs: config.timeoutMs ?? task.timeoutMs ?? config.taskTimeoutMs,
    outDir,
    signal: input.signal,
  })
  const early = statusFor(run, false)
  const artifact =
    early.status === "interrupted" || early.status === "harness_error"
      ? undefined
      : await fetchArtifact({
          source: input.source,
          username: config.loginom.username,
          receipts: run.saveReceipts,
          instructed: `${name}.lgp`,
          resultPrefix: name,
          since,
          outDir: path.join(outDir, "artifact"),
        })
  const { status, stop } = statusFor(run, artifact !== undefined)
  const cleanupError =
    artifact && !config.keepStorage
      ? await cleanupArtifact(input.source, artifact).then(
          () => null,
          (error: unknown) => describe(error),
        )
      : null
  const noJudge = status === "harness_error" || status === "interrupted"
  const result: AttemptResult & { stop: boolean } = {
    ...base,
    status,
    stop,
    exit_code: run.exitCode,
    timed_out: run.timedOut,
    interrupted: run.interrupted,
    failure_kind: status === "failed" ? run.failureKind : null,
    score: artifact || noJudge ? null : 0,
    pass: artifact || noJudge ? null : false,
    judge_status: artifact || noJudge ? "skipped" : "no_artifact",
    duration_ms: run.durationMs,
    cost: run.cost,
    tokens: run.tokens,
    counters: run.counters,
    package_path: artifact?.packagePath ?? null,
    artifact_origin: artifact?.origin ?? null,
    artifact_ambiguous: artifact?.ambiguous ?? [],
    cleanup_error: cleanupError,
    action_manifest_sha256: run.actionManifestSha256 ?? null,
    session_id: run.sessionId ?? null,
    errors: run.errors,
  }
  await Bun.write(path.join(outDir, "result.json"), JSON.stringify(result, null, 2))
  return result
}

async function prepareProfile(config: EvalConfig, command: AgentCommand) {
  if (config.resetProfile) await resetProfile(config)
  await releaseStaleWriter(config.profileDir)
  await ensureProfile(config, command)
  await assertAuth(config, command)
  await recoverIfNeeded(command, 2)
}

async function afterAttempt(config: EvalConfig, command: AgentCommand, result: AttemptResult) {
  if (result.timed_out || result.interrupted) {
    if (!(await waitProfileIdle(config.profileDir)))
      return { stop: `Процессы профиля ${config.profileDir} не завершились за 60 с` }
    await releaseStaleWriter(config.profileDir)
  }
  const recovery = await recoverIfNeeded(command, 1)
  return { recovered: recovery.recovered }
}

export function installSigint(controller: AbortController) {
  process.on("SIGINT", () => {
    if (controller.signal.aborted) {
      console.error("\nПовторный Ctrl+C — немедленный выход без summary.")
      process.exit(130)
    }
    console.error("\nCtrl+C: останавливаю текущую попытку и дописываю summary. Ещё раз Ctrl+C — выход немедленно.")
    controller.abort()
  })
}

export const stamp = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-")

export function redact(config: EvalConfig) {
  return {
    ...config,
    dock: { ...config.dock, apiKey: config.dock.apiKey ? "<set>" : "<unset>" },
    agent: { ...config.agent, provider: config.agent.provider ? { ...config.agent.provider, apiKey: "<set>" } : undefined },
  }
}

export const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function leftovers(source: ArtifactSource, runId: string) {
  const entries = await listStorage(source).catch(() => [])
  return entries
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`eval-${runId}-`))
    .sort()
}

function emptyResult(taskId: string, attempt: number, profileRecovered: boolean): AttemptResult {
  return {
    task_id: taskId,
    attempt,
    status: "harness_error",
    exit_code: null,
    timed_out: false,
    interrupted: false,
    failure_kind: null,
    score: null,
    pass: null,
    judge_status: "skipped",
    judge_attempts: 0,
    judge_confidence: null,
    judge_summary: null,
    checklist: null,
    duration_ms: 0,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0 },
    counters: { toolCalls: 0, loginomToolCalls: 0, toolErrors: 0, memoryToolCalls: 0 },
    package_path: null,
    artifact_origin: null,
    artifact_ambiguous: [],
    cleanup_error: null,
    action_manifest_sha256: null,
    session_id: null,
    profile_recovered: profileRecovered,
    errors: [],
    harness_error: null,
  }
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).then(
    (result) => process.exit(result.code),
    (error: unknown) => {
      console.error(error instanceof EvalFailure ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error))
      process.exit(error instanceof EvalFailure ? error.exitCode : 1)
    },
  )
}
```

Run: `bun test test/run.test.ts` → PASS. Затем вручную: `bun run src/run.ts --dry-run --repeat 2` — в stdout `report.md`, в `results/` новая папка.

- [ ] **Шаг 7.3 (RED→GREEN): `stamp` и `--only`**

```ts
import { stamp } from "../src/run"

test("stamp: YYYYMMDD-HHmmss", () => {
  expect(stamp(new Date("2026-09-18T12:34:56.789Z"))).toBe("20260918-123456")
})

test("main --dry-run --only: подмножество задач", async () => {
  const result = await main(["--dry-run", "--only", "group-sum-qty"])
  const summary = (await Bun.file(path.join(result.runDir!, "summary.json")).json()) as RunSummary
  expect(summary.task_ids).toEqual(["group-sum-qty"])
  expect(summary.metrics.total).toBe(1)
  await rm(result.runDir!, { recursive: true, force: true })
}, 30_000)
```

Run: `bun test test/run.test.ts` → PASS.

- [ ] **Шаг 7.4: коммит**

```bash
bun typecheck && bun test
git add evals/src/run.ts evals/test/run.test.ts
git commit -m "feat(evals): round-robin attempt runner with dry-run end to end"
```

---

### Task 8: Судья (`judge.ts`) и подключение к прогону

**Files:**
- Create: `evals/src/judge-prompt.md`, `evals/src/verdict.schema.json`, `evals/src/judge.ts`
- Modify: `evals/src/run.ts` (поле `judge` в summary, вызов `judgeTask` в `attemptBody`)
- Test: `evals/test/judge.test.ts`, дополнение `evals/test/run.test.ts`

**Interfaces:**
- Produces: `type Verdict = { checklist: { id; passed; evidence }[]; summary; confidence: "high" | "medium" | "low" }`; `type JudgeSettings = { command: string[]; model; reasoning; timeoutMs; passThreshold; env?: Record<string, string> }`; `judgeInfo(config) → { backend: "codex"; codex_version: string | null; model; reasoning; prompt_sha256 }`; `judgeCommand({ command, dir, model, reasoning }) → string[]`; `parseVerdict(text) → Verdict | undefined`; `scoreVerdict(checklist, verdict, threshold) → { ok: true; score; pass; items } | { ok: false; error }`; `prepareJudgeDir({ task, run?, artifactDir, prompt, dir, checklist })`; `judgeTask({ task, run?, artifactDir, prompt, outDir, judge, signal?, checklist? }) → { ok: true; verdict; score; pass; items; attempts } | { ok: false; error; attempts }` (`Judged`); `judgedFields(judged)` → поля `AttemptResult` (`score, pass, judge_status, judge_attempts, judge_confidence, judge_summary, checklist`).

- [ ] **Шаг 8.1: промпт и схема судьи**

`evals/src/verdict.schema.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["checklist", "summary", "confidence"],
  "properties": {
    "checklist": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "passed", "evidence"],
        "properties": {
          "id": { "type": "string" },
          "passed": { "type": "boolean" },
          "evidence": { "type": "string" }
        }
      }
    },
    "summary": { "type": "string" },
    "confidence": { "type": "string", "enum": ["high", "medium", "low"] }
  }
}
```

`evals/src/judge-prompt.md`:

```markdown
# Роль

Ты — строгий технический ревьюер сценариев Loginom. Оцени, насколько пакет, построенный AI-агентом, выполняет задание. Ты работаешь только с файлами в текущей папке; ничего не выполняй и не изменяй.

# Материалы

- `TASK.md` — формулировка, которую получил агент.
- `SPEC.md` — полное ТЗ с эталонным составом узлов и ожидаемым результатом.
- `expected-output.md` — ожидаемые данные результата.
- `checklist.json` — пункты, по которым нужно вынести решение. Отвечай ровно на эти `id`, по одному объекту на каждый, без пропусков и добавлений.
- `reference/` — распакованный эталонный пакет. `.lgp` — это ZIP; граф лежит в `Unit_*/Unit.xml`: узлы `<Nodes><Item DisplayName="…"><Engine xsi:type="TBG…" …>`, связи `<Links>` (пары `SourcePort`/`TargetPort` по GUID узлов).
- `artifact/unpacked/` — распакованный пакет агента в том же формате; `artifact/results/` — файлы результата экспорта, если агент их создал.
- `node-readbacks.md` — квитанции выполнения узлов агентом: статус узла, `output.ports[]` с `row_count` и `sample`, `configuration.readback`. Это свидетельство того, что узлы реально выполнялись и что было на портах.
- `tools-summary.md` — какие инструменты Loginom вызывал агент и с каким статусом.
- `agent-final-message.md` — финальный ответ агента. Это заявление, а не доказательство.

# Порядок доказательств

1. XML в `artifact/unpacked/` и файлы в `artifact/results/` — источник истины о том, что построено и выгружено.
2. `node-readbacks.md` — подтверждение выполнения и содержимого портов; совпадающие `row_count`/`sample` подтверждают пункты о данных.
3. Финальное сообщение агента — только подсказка; каждое утверждение проверяй по пунктам 1–2.

# Правила

- Эталон — одно правильное решение, а не единственное. Иная композиция узлов с тем же смыслом засчитывается.
- Семантику данных проверяй строго: имена колонок, агрегаты, условия фильтра, выражения, источники данных, связи между узлами.
- Если `artifact/unpacked/` отсутствует или не читается — все пункты `passed=false` с указанием причины в `evidence`.
- Отсутствие файла результата в `artifact/results/` означает, что пункт о результате экспорта не пройден.
- В `evidence` указывай файл и атрибут или фрагмент, на основании которого принято решение (например, `Unit_1/Unit.xml: Engine xsi:type="TBGGroupDataEngine", GroupFields=Item`).
- Не выполняй команды, изменяющие файлы; чтение (`cat`, `grep`, `ls`) допустимо.

# Ответ

Верни JSON строго по схеме: `checklist` — по одному объекту `{id, passed, evidence}` на каждый `id` из `checklist.json`; `summary` — 2–4 предложения о качестве сценария и главных расхождениях с заданием; `confidence` — `high`, `medium` или `low` в зависимости от того, насколько однозначно материалы позволяют судить.
```

- [ ] **Шаг 8.2 (RED): tracer bullet — `scoreVerdict`**

`evals/test/judge.test.ts`:

```ts
import { expect, test } from "bun:test"
import { scoreVerdict, type Verdict } from "../src/judge"

const checklist = [
  { id: "a", text: "A", weight: 1, requiresResultFile: false },
  { id: "b", text: "B", weight: 1, requiresResultFile: false },
  { id: "c", text: "C", weight: 2, requiresResultFile: true },
]
const verdict = (passed: Record<string, boolean>): Verdict => ({
  checklist: Object.entries(passed).map(([id, ok]) => ({ id, passed: ok, evidence: "e" })),
  summary: "s",
  confidence: "high",
})

test("scoreVerdict: взвешенная сумма и порог", () => {
  const scored = scoreVerdict(checklist, verdict({ a: true, b: true, c: false }), 70)
  expect(scored).toMatchObject({ ok: true, score: 50, pass: false })
  expect(scoreVerdict(checklist, verdict({ a: true, b: false, c: true }), 70)).toMatchObject({ ok: true, score: 75, pass: true })
})

test("scoreVerdict: пропуск, лишний или дублирующийся id — ошибка", () => {
  expect(scoreVerdict(checklist, verdict({ a: true, b: true }), 70)).toMatchObject({ ok: false })
  expect(scoreVerdict(checklist, verdict({ a: true, b: true, c: true, d: true }), 70)).toMatchObject({ ok: false })
  const duplicated = verdict({ a: true, b: true, c: true })
  duplicated.checklist.push({ id: "a", passed: false, evidence: "dup" })
  expect(scoreVerdict(checklist, duplicated, 70)).toMatchObject({ ok: false })
})
```

Run: `bun test test/judge.test.ts` → FAIL.

- [ ] **Шаг 8.3 (GREEN): `judge.ts` — чистые функции**

```ts
import path from "node:path"
import { cp, mkdir, rm } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { evalsRoot } from "./config"
import type { ChecklistItem, Task } from "./task"
import type { AgentRun } from "./cli"
import { unzip } from "./artifact"

export const judgePromptFile = path.join(evalsRoot, "src", "judge-prompt.md")
export const verdictSchemaFile = path.join(evalsRoot, "src", "verdict.schema.json")

export type Verdict = {
  checklist: { id: string; passed: boolean; evidence: string }[]
  summary: string
  confidence: "high" | "medium" | "low"
}
export type JudgeSettings = {
  command: string[]
  model: string
  reasoning: string
  timeoutMs: number
  passThreshold: number
  env?: Record<string, string>
}
type RunView = Pick<AgentRun, "finalText" | "tools" | "nodeReceipts" | "nodeReceiptsDropped">

export function parseVerdict(text: string): Verdict | undefined {
  const parsed = parseJson(text) as Partial<Verdict> | undefined
  if (!parsed || !Array.isArray(parsed.checklist) || typeof parsed.summary !== "string") return undefined
  if (!["high", "medium", "low"].includes(String(parsed.confidence))) return undefined
  const valid = parsed.checklist.every(
    (item) => typeof item?.id === "string" && typeof item.passed === "boolean" && typeof item.evidence === "string",
  )
  return valid ? (parsed as Verdict) : undefined
}

export function scoreVerdict(checklist: ChecklistItem[], verdict: Verdict, threshold: number) {
  const ids = verdict.checklist.map((item) => item.id)
  const expected = checklist.map((item) => item.id)
  const missing = expected.filter((id) => !ids.includes(id))
  const extra = ids.filter((id) => !expected.includes(id))
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (missing.length || extra.length || duplicates.length)
    return {
      ok: false as const,
      error: `checklist ids: missing=[${missing}] extra=[${extra}] duplicates=[${duplicates}]`,
    }
  const items = checklist.map((item) => {
    const answer = verdict.checklist.find((candidate) => candidate.id === item.id)
    return { id: item.id, passed: answer?.passed === true, evidence: answer?.evidence ?? "" }
  })
  const total = checklist.reduce((sum, item) => sum + item.weight, 0)
  const passed = checklist.reduce(
    (sum, item) => sum + (items.find((candidate) => candidate.id === item.id)?.passed ? item.weight : 0),
    0,
  )
  const score = Math.round((100 * passed) / total)
  return { ok: true as const, score, pass: score >= threshold, items }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
```

Run: `bun test test/judge.test.ts` → PASS.

- [ ] **Шаг 8.4 (RED→GREEN): `judgeCommand` и `judgeInfo`**

```ts
import path from "node:path"
import { judgeCommand, judgeInfo } from "../src/judge"
import { loadConfig } from "../src/config"
import { evalsRoot } from "../src/config"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("judgeCommand: флаги codex exec и абсолютные пути", () => {
  const cmd = judgeCommand({ command: ["codex"], dir: "/tmp/j", model: "gpt-6-astra", reasoning: "high" })
  expect(cmd.slice(0, 2)).toEqual(["codex", "exec"])
  for (const flag of ["--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "--json"]) expect(cmd).toContain(flag)
  expect(cmd.join(" ")).toContain("-s read-only -C /tmp/j -m gpt-6-astra -c model_reasoning_effort=high -c project_doc_max_bytes=0")
  expect(cmd.join(" ")).toContain("--output-schema /tmp/j/verdict.schema.json -o /tmp/j/verdict.json -")
})

test("judgeInfo: версия судьи и sha256 промпта", async () => {
  const info = await judgeInfo(loadConfig(["--judge-only", "x"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge }))
  expect(info).toMatchObject({ backend: "codex", codex_version: "fake-codex 0.0.0", model: "fake", reasoning: "high" })
  expect(info.prompt_sha256).toMatch(/^[0-9a-f]{64}$/)
})
```

Добавить в `judge.ts`:

```ts
export async function judgeInfo(config: EvalConfig) {
  const version = await Bun.$`${config.judge.command} --version`.quiet().nothrow()
  return {
    backend: "codex" as const,
    codex_version: version.exitCode === 0 ? version.text().trim() : null,
    model: config.judge.model,
    reasoning: config.judge.reasoning,
    prompt_sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(judgePromptFile).bytes()).digest("hex"),
  }
}
export type JudgeInfo = Awaited<ReturnType<typeof judgeInfo>>

export function judgeCommand(input: { command: string[]; dir: string; model: string; reasoning: string }) {
  return [
    ...input.command,
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "-s",
    "read-only",
    "-C",
    input.dir,
    "-m",
    input.model,
    "-c",
    `model_reasoning_effort=${input.reasoning}`,
    "-c",
    "project_doc_max_bytes=0",
    "--json",
    "--output-schema",
    path.join(input.dir, "verdict.schema.json"),
    "-o",
    path.join(input.dir, "verdict.json"),
    "-",
  ]
}
```

Run: `bun test test/judge.test.ts` → PASS.

- [ ] **Шаг 8.5 (RED→GREEN): `prepareJudgeDir` — содержимое папки судьи**

```ts
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import { loadTasks } from "../src/task"
import { fetchArtifact, parseArtifactSource } from "../src/artifact"
import { prepareJudgeDir } from "../src/judge"

const fixtureArtifact = async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-artifact-"))
  const artifact = await fetchArtifact({
    source: parseArtifactSource(`dir:${path.join(evalsRoot, "fixtures", "storage")}`, { container: "c", storageDir: "/s" }),
    username: "user",
    receipts: ["/user/fixture-group-sum-qty.lgp"],
    instructed: "x.lgp",
    resultPrefix: "fixture-group-sum-qty",
    since: Date.now(),
    outDir,
  })
  return artifact!
}

test("prepareJudgeDir: все материалы, эталон распакован, заглушки без run", async () => {
  const [task] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
  const artifact = await fixtureArtifact()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-"))
  await prepareJudgeDir({ task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "промпт", dir, checklist: task!.checklist })
  for (const file of ["PROMPT.md", "TASK.md", "SPEC.md", "checklist.json", "expected-output.md", "agent-final-message.md", "tools-summary.md", "node-readbacks.md", "verdict.schema.json"])
    expect(await Bun.file(path.join(dir, file)).exists()).toBe(true)
  expect((await Array.fromAsync(new Bun.Glob("Unit_*/Unit.xml").scan(path.join(dir, "reference")))).length).toBeGreaterThan(0)
  expect((await Array.fromAsync(new Bun.Glob("unpacked/Unit_*/Unit.xml").scan(path.join(dir, "artifact")))).length).toBeGreaterThan(0)
  expect(await Bun.file(path.join(dir, "artifact", "results", "fixture-group-sum-qty.result.csv")).exists()).toBe(true)
  expect(await Bun.file(path.join(dir, "agent-final-message.md")).text()).toBe("недоступно: калибровка")
  expect(await Bun.file(path.join(dir, "TASK.md")).text()).toBe("промпт")
  const checklist = await Bun.file(path.join(dir, "checklist.json")).json()
  expect(checklist[0]).toEqual({ id: "import-csv", text: task!.checklist[0]!.text })
})
```

Добавить в `judge.ts`:

```ts
export async function prepareJudgeDir(input: {
  task: Task
  run?: RunView
  artifactDir: string
  prompt: string
  dir: string
  checklist: ChecklistItem[]
}) {
  await rm(input.dir, { recursive: true, force: true })
  await mkdir(input.dir, { recursive: true })
  const stub = "недоступно: калибровка"
  await Promise.all([
    cp(judgePromptFile, path.join(input.dir, "PROMPT.md")),
    Bun.write(path.join(input.dir, "TASK.md"), input.prompt),
    cp(path.join(input.task.dir, input.task.spec), path.join(input.dir, "SPEC.md")),
    Bun.write(
      path.join(input.dir, "checklist.json"),
      JSON.stringify(input.checklist.map(({ id, text }) => ({ id, text })), null, 2),
    ),
    Bun.write(path.join(input.dir, "expected-output.md"), input.task.expectedOutput),
    Bun.write(
      path.join(input.dir, "agent-final-message.md"),
      input.run ? (input.run.finalText ?? "(агент не вернул финального текста)") : stub,
    ),
    Bun.write(path.join(input.dir, "tools-summary.md"), input.run ? toolsSummary(input.run) : stub),
    Bun.write(path.join(input.dir, "node-readbacks.md"), input.run ? nodeReadbacks(input.run) : stub),
    cp(verdictSchemaFile, path.join(input.dir, "verdict.schema.json")),
    unzip(path.join(input.task.dir, input.task.reference), path.join(input.dir, "reference")),
    cp(input.artifactDir, path.join(input.dir, "artifact"), { recursive: true }),
  ])
}

function toolsSummary(run: RunView) {
  const rows = run.tools.map(
    (tool) => `| ${tool.tool} | ${tool.action ?? tool.target ?? ""} | ${tool.status} | ${tool.error ?? ""} |`,
  )
  return ["| Инструмент | action / тип узла | Статус | Ошибка |", "|---|---|---|---|", ...rows].join("\n")
}

function nodeReadbacks(run: RunView) {
  const blocks = run.nodeReceipts.map((receipt, index) => `## Квитанция ${index + 1}\n\n\`\`\`json\n${receipt}\n\`\`\``)
  const dropped = run.nodeReceiptsDropped ? `\n\n_Отброшено старших квитанций: ${run.nodeReceiptsDropped}_` : ""
  return blocks.length ? blocks.join("\n\n") + dropped : "Квитанций выполнения узлов нет."
}
```

Run: `bun test test/judge.test.ts` → PASS.

- [ ] **Шаг 8.6 (RED→GREEN): `judgeTask` с fake-codex — успех, отказ, повтор**

```ts
import { judgeTask, type JudgeSettings } from "../src/judge"

const settings = (env: Record<string, string> = {}): JudgeSettings => ({
  command: ["bun", path.join(evalsRoot, "fixtures", "fake-codex.ts")],
  model: "fake",
  reasoning: "high",
  timeoutMs: 30_000,
  passThreshold: 70,
  env,
})

const judgeFixture = async (env: Record<string, string> = {}) => {
  const [task] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
  const artifact = await fixtureArtifact()
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-"))
  return judgeTask({ task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "p", outDir, judge: settings(env) })
}

test("judgeTask: pass → score 100, одна попытка, verdict.json на диске", async () => {
  const judged = await judgeFixture()
  expect(judged).toMatchObject({ ok: true, score: 100, pass: true, attempts: 1 })
})

test("judgeTask: fail → 0; half → округлённая доля", async () => {
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "fail" })).toMatchObject({ ok: true, score: 0, pass: false })
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "half" })).toMatchObject({ ok: true, score: 57 })
})

test("judgeTask: постоянный отказ → error после двух попыток", async () => {
  expect(await judgeFixture({ FAKE_CODEX_EXIT: "1" })).toMatchObject({ ok: false, attempts: 2 })
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "invalid" })).toMatchObject({ ok: false, attempts: 2 })
})

test("judgeTask: первый отказ, второй успех → ok, attempts 2", async () => {
  const marker = path.join(await mkdtemp(path.join(os.tmpdir(), "evals-flaky-")), "marker")
  expect(await judgeFixture({ FAKE_CODEX_FLAKY_MARKER: marker })).toMatchObject({ ok: true, score: 100, attempts: 2 })
})
```

Добавить в `judge.ts`:

```ts
export async function judgeTask(input: {
  task: Task
  run?: RunView
  artifactDir: string
  prompt: string
  outDir: string
  judge: JudgeSettings
  signal?: AbortSignal
  checklist?: ChecklistItem[]
}) {
  const checklist = input.checklist ?? input.task.checklist
  await prepareJudgeDir({ ...input, dir: input.outDir, checklist })
  const first = await invoke(input, checklist, 1)
  if (first.ok) return { ...first, attempts: 1 as const }
  if (input.signal?.aborted) return { ok: false as const, error: first.error, attempts: 1 as const }
  const second = await invoke(input, checklist, 2)
  return second.ok
    ? { ...second, attempts: 2 as const }
    : { ok: false as const, error: `${first.error}; повтор: ${second.error}`, attempts: 2 as const }
}
export type Judged = Awaited<ReturnType<typeof judgeTask>>

export function judgedFields(judged: Judged) {
  if (judged.ok)
    return {
      score: judged.score,
      pass: judged.pass,
      judge_status: "scored" as const,
      judge_attempts: judged.attempts,
      judge_confidence: judged.verdict.confidence,
      judge_summary: judged.verdict.summary,
      checklist: judged.items,
    }
  return {
    score: null,
    pass: null,
    judge_status: "error" as const,
    judge_attempts: judged.attempts,
    judge_confidence: null,
    judge_summary: judged.error,
    checklist: null,
  }
}

async function invoke(
  input: { outDir: string; judge: JudgeSettings; signal?: AbortSignal },
  checklist: ChecklistItem[],
  attempt: number,
) {
  const verdictPath = path.join(input.outDir, "verdict.json")
  await rm(verdictPath, { force: true })
  const proc = Bun.spawn(
    judgeCommand({ command: input.judge.command, dir: input.outDir, model: input.judge.model, reasoning: input.judge.reasoning }),
    {
      cwd: input.outDir,
      env: { ...process.env, ...input.judge.env },
      stdin: Bun.file(path.join(input.outDir, "PROMPT.md")),
      stdout: Bun.file(path.join(input.outDir, `events-${attempt}.jsonl`)),
      stderr: Bun.file(path.join(input.outDir, `stderr-${attempt}.txt`)),
    },
  )
  const timer = setTimeout(() => proc.kill("SIGKILL"), input.judge.timeoutMs)
  const onAbort = () => proc.kill("SIGKILL")
  input.signal?.addEventListener("abort", onAbort, { once: true })
  const exitCode = await proc.exited
  clearTimeout(timer)
  input.signal?.removeEventListener("abort", onAbort)
  if (exitCode !== 0) return { ok: false as const, error: `судья завершился кодом ${exitCode}` }
  const file = Bun.file(verdictPath)
  if (!(await file.exists())) return { ok: false as const, error: "verdict.json не создан" }
  const verdict = parseVerdict(await file.text())
  if (!verdict) return { ok: false as const, error: "verdict.json не соответствует схеме" }
  const scored = scoreVerdict(checklist, verdict, input.judge.passThreshold)
  if (!scored.ok) return { ok: false as const, error: scored.error }
  return { ok: true as const, verdict, ...scored }
}
```

Run: `bun test test/judge.test.ts` → PASS. (`half` при 7 пунктах даёт 4/7 → 57.)

- [ ] **Шаг 8.7 (RED→GREEN): подключение судьи к прогону**

Полноценный прогон без `--dry-run` требует preflight с Loginom и docker — в тестах недоступен, поэтому подключение судьи проверяется на уровне `runAttempt` с fake CLI, `dir:`-хранилищем и fake-судьёй. Тест в `test/run.test.ts`:

```ts
import { runAttempt } from "../src/run"
import { loadConfig } from "../src/config"
import { loadTasks } from "../src/task"
import { agentCommand } from "../src/cli"
import { parseArtifactSource } from "../src/artifact"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"

test("runAttempt: с судьёй completed получает score и judge_status=scored", async () => {
  const config = { ...loadConfig(["--dry-run"], {}), skipJudge: false }
  const [task] = await loadTasks(config.tasksDir, ["group-sum-qty"])
  const runDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const result = await runAttempt({
    config,
    command: agentCommand(config),
    source: parseArtifactSource(config.artifactSource, config.loginom),
    task: task!,
    attempt: 1,
    runId: "test-run",
    runDir,
    signal: new AbortController().signal,
    profileRecovered: false,
    judge: { command: ["bun", path.join(evalsRoot, "fixtures", "fake-codex.ts")], model: "fake", reasoning: "high", timeoutMs: 30_000, passThreshold: 70 },
  })
  expect(result).toMatchObject({ status: "completed", score: 100, pass: true, judge_status: "scored", judge_attempts: 1, judge_confidence: "high" })
  expect(result.checklist?.length).toBe(7)
  expect(await Bun.file(path.join(runDir, "group-sum-qty", "1", "judge", "verdict.json")).exists()).toBe(true)
  await rm(runDir, { recursive: true, force: true })
}, 60_000)
```

Изменения в `run.ts`:

1. Импорт: `import { judgeInfo, judgeTask, judgedFields, type JudgeSettings } from "./judge"`.
2. В `main` после записи `config.json`:

```ts
  const judge = config.skipJudge ? null : await judgeInfo(config)
  const settings: JudgeSettings | undefined = judge
    ? {
        command: config.judge.command,
        model: config.judge.model,
        reasoning: config.judge.reasoning,
        timeoutMs: config.judgeTimeoutMs,
        passThreshold: config.passThreshold,
      }
    : undefined
```

   В вызов `runAttempt` добавить `judge: settings`; в объекте `summary` заменить `judge: null` на `judge`.
3. В сигнатуру `runAttempt` (объект `input`) добавить поле `judge?: JudgeSettings`.
4. В `attemptBody` строки от `const noJudge = …` до `await Bun.write(path.join(outDir, "result.json"), …)` заменить целиком на:

```ts
  const noJudge = status === "harness_error" || status === "interrupted"
  const judged =
    artifact && input.judge && !noJudge && !input.signal.aborted
      ? await judgeTask({
          task,
          run,
          artifactDir: path.dirname(artifact.unpackedDir),
          prompt,
          outDir: path.join(outDir, "judge"),
          judge: input.judge,
          signal: input.signal,
        })
      : undefined
  const judgeFields = judged
    ? judgedFields(judged)
    : {
        score: artifact || noJudge ? null : 0,
        pass: artifact || noJudge ? null : false,
        judge_status: (artifact || noJudge ? "skipped" : "no_artifact") as AttemptResult["judge_status"],
        judge_attempts: 0,
        judge_confidence: null,
        judge_summary: null,
        checklist: null,
      }
  const result: AttemptResult & { stop: boolean } = {
    ...base,
    ...judgeFields,
    status,
    stop,
    exit_code: run.exitCode,
    timed_out: run.timedOut,
    interrupted: run.interrupted,
    failure_kind: status === "failed" ? run.failureKind : null,
    duration_ms: run.durationMs,
    cost: run.cost,
    tokens: run.tokens,
    counters: run.counters,
    package_path: artifact?.packagePath ?? null,
    artifact_origin: artifact?.origin ?? null,
    artifact_ambiguous: artifact?.ambiguous ?? [],
    cleanup_error: cleanupError,
    action_manifest_sha256: run.actionManifestSha256 ?? null,
    session_id: run.sessionId ?? null,
    errors: run.errors,
  }
  await Bun.write(path.join(outDir, "result.json"), JSON.stringify(result, null, 2))
  return result
```

Run: `bun test` → PASS (dry-run тест из 7.1 остаётся зелёным: `skipJudge=true` → `judge` не передаётся).

- [ ] **Шаг 8.8: коммит**

```bash
bun typecheck && bun test
git add evals/src/judge.ts evals/src/judge-prompt.md evals/src/verdict.schema.json evals/src/run.ts evals/test/judge.test.ts evals/test/run.test.ts
git commit -m "feat(evals): codex judge with checklist scoring and retry"
```

---

### Task 9: Режимы без агента — `--judge-only` и `--calibrate`

**Files:**
- Create: `evals/src/rejudge.ts`, `evals/src/calibrate.ts`
- Modify: `evals/src/run.ts` (диспетчер в начале `main`)
- Test: `evals/test/rejudge.test.ts`, `evals/test/calibrate.test.ts`

**Interfaces:**
- Produces: `rejudge(config, runId) → Promise<{ code: number; runDir: string }>`; `calibrate(config) → Promise<{ code: number; runDir: string }>`.
- Consumes: `judgeTask`, `judgedFields`, `judgeInfo`, `preflight`, `loadTasks`, `rubricHash`, `agentInputsHash`, `aggregate`, `aggregateTask`, `writeSummary`, `renderReport`, `installSigint`, `stamp`, `redact`, `unzip`.

- [ ] **Шаг 9.1 (RED): tracer bullet — пересуживание dry-run прогона fake-судьёй**

`evals/test/rejudge.test.ts`:

```ts
import { expect, test } from "bun:test"
import path from "node:path"
import { rm } from "node:fs/promises"
import { main } from "../src/run"
import { evalsRoot } from "../src/config"
import type { RunSummary } from "../src/report"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("--judge-only: пересуживает попытки с артефактом, сохраняет prev, не трогает остальные", async () => {
  const dry = await main(["--dry-run", "--repeat", "1"])
  const runId = path.basename(dry.runDir!)
  process.env.JUDGE_MODEL = "fake"
  process.env.EVAL_JUDGE_COMMAND = fakeJudge
  const result = await main(["--judge-only", runId])
  expect(result.code).toBe(0)
  const summary = (await Bun.file(path.join(dry.runDir!, "summary.json")).json()) as RunSummary
  expect(summary.judge?.model).toBe("fake")
  const byTask = Object.fromEntries(summary.tasks.map((task) => [task.id, task]))
  expect(byTask["group-sum-qty"]!.attempts[0]).toMatchObject({ status: "completed", score: 100, judge_status: "scored" })
  expect(byTask["calc-data-double"]!.attempts[0]).toMatchObject({ status: "no_artifact", score: 0, judge_status: "no_artifact" })
  expect(summary.metrics.mean_score).toBeCloseTo(33.3, 0)
  expect(await Bun.file(path.join(dry.runDir!, "summary.prev.json")).exists()).toBe(true)
  await rm(dry.runDir!, { recursive: true, force: true })
}, 90_000)
```

Run: `bun test test/rejudge.test.ts` → FAIL (`--judge-only` пока идёт обычным путём и падает на preflight).

- [ ] **Шаг 9.2 (GREEN): `rejudge.ts` и диспетчер**

`evals/src/rejudge.ts`:

```ts
import path from "node:path"
import { cp } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { EvalFailure } from "./fail"
import { agentInputsHash, loadTasks, rubricHash } from "./task"
import type { AgentRun } from "./cli"
import { parseArtifactSource } from "./artifact"
import { preflight } from "./preflight"
import { judgeInfo, judgeTask, judgedFields, type JudgeSettings } from "./judge"
import { aggregate, aggregateTask, renderReport, writeSummary, type AttemptResult, type RunSummary } from "./report"
import { installSigint } from "./run"

export async function rejudge(config: EvalConfig, runId: string) {
  const runDir = path.join(config.resultsDir, runId)
  const summaryFile = Bun.file(path.join(runDir, "summary.json"))
  if (!(await summaryFile.exists())) throw new EvalFailure(`Нет прогона ${runId}: ${runDir}/summary.json не найден`, 2)
  const prev = (await summaryFile.json()) as RunSummary
  const tasks = await loadTasks(config.tasksDir, prev.task_ids)
  await preflight(config, parseArtifactSource("docker", config.loginom))
  const judge = await judgeInfo(config)
  if ((await agentInputsHash(tasks)) !== prev.agent_inputs_hash)
    console.error("Предупреждение: agent_inputs_hash текущих задач отличается от прогона — артефакты созданы под прежними входами")
  await cp(path.join(runDir, "summary.json"), path.join(runDir, "summary.prev.json"))
  const controller = new AbortController()
  installSigint(controller)
  const settings: JudgeSettings = {
    command: config.judge.command,
    model: config.judge.model,
    reasoning: config.judge.reasoning,
    timeoutMs: config.judgeTimeoutMs,
    passThreshold: config.passThreshold,
  }
  const attempts: AttemptResult[] = []
  for (const group of prev.tasks) {
    const task = tasks.find((item) => item.id === group.id)
    for (const attempt of group.attempts) {
      const dir = path.join(runDir, group.id, String(attempt.attempt))
      const artifactDir = path.join(dir, "artifact")
      const units = await Array.fromAsync(new Bun.Glob("unpacked/Unit_*/Unit.xml").scan(artifactDir)).catch(() => [])
      const judgeable = task && units.length > 0 && attempt.status !== "harness_error" && attempt.status !== "interrupted"
      if (!judgeable || controller.signal.aborted) {
        attempts.push(attempt)
        continue
      }
      const previous = path.join(dir, "judge", "verdict.json")
      if (await Bun.file(previous).exists()) await cp(previous, path.join(dir, "judge", "verdict.prev.json"))
      const run = (await Bun.file(path.join(dir, "run.json")).json()) as AgentRun
      const prompt = await Bun.file(path.join(dir, "prompt.txt")).text()
      const judged = await judgeTask({ task, run, artifactDir, prompt, outDir: path.join(dir, "judge"), judge: settings, signal: controller.signal })
      const updated: AttemptResult = { ...attempt, ...judgedFields(judged) }
      await Bun.write(path.join(dir, "result.json"), JSON.stringify(updated, null, 2))
      attempts.push(updated)
    }
  }
  const summary: RunSummary = {
    ...prev,
    finished_at: new Date().toISOString(),
    interrupted: controller.signal.aborted,
    judge,
    rubric_hash: await rubricHash(tasks),
    metrics: aggregate(attempts, false),
    tasks: prev.tasks.map((group) => {
      const own = attempts.filter((item) => item.task_id === group.id)
      return { id: group.id, metrics: aggregateTask(own, false), attempts: own }
    }),
  }
  await writeSummary(runDir, summary)
  console.log(renderReport(summary))
  return { code: 0, runDir }
}
```

В `run.ts` в начале `main` после `loadConfig`:

```ts
  if (config.judgeOnly !== undefined) {
    const { rejudge } = await import("./rejudge")
    return rejudge(config, config.judgeOnly)
  }
  if (config.calibrate) {
    const { calibrate } = await import("./calibrate")
    return calibrate(config)
  }
```

(Динамические импорты разрывают цикл `run.ts ↔ rejudge.ts` по `installSigint`.)

Run: `bun test test/rejudge.test.ts` → PASS.

- [ ] **Шаг 9.3 (RED→GREEN): `--calibrate`**

`evals/test/calibrate.test.ts`:

```ts
import { expect, test } from "bun:test"
import path from "node:path"
import { rm } from "node:fs/promises"
import { main } from "../src/run"
import { evalsRoot } from "../src/config"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("--calibrate: positive/negative для каждой задачи, предупреждение когда negative слишком высок", async () => {
  process.env.JUDGE_MODEL = "fake"
  process.env.EVAL_JUDGE_COMMAND = fakeJudge
  delete process.env.FAKE_CODEX_VERDICT
  const result = await main(["--calibrate"])
  expect(result.code).toBe(0)
  const calibration = await Bun.file(path.join(result.runDir, "calibration.json")).json()
  expect(calibration.rows).toHaveLength(6)
  expect(calibration.rows.filter((row: { kind: string }) => row.kind === "positive").every((row: { score: number }) => row.score === 100)).toBe(true)
  // fake-судья ставит 100 всем, поэтому negative выше порога 40 — три предупреждения
  expect(calibration.warnings).toHaveLength(3)
  expect(await Bun.file(path.join(result.runDir, "calibration.md")).exists()).toBe(true)
  expect(await Bun.file(path.join(result.runDir, "summary.json")).exists()).toBe(false)
  expect(await Bun.file(path.join(result.runDir, "group-sum-qty", "positive", "judge", "checklist.json")).json()).not.toContainEqual(expect.objectContaining({ id: "result-rows" }))
  await rm(result.runDir, { recursive: true, force: true })
}, 120_000)
```

`evals/src/calibrate.ts`:

```ts
import path from "node:path"
import { cp, mkdir } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { loadTasks, rubricHash } from "./task"
import { parseArtifactSource, unzip } from "./artifact"
import { preflight } from "./preflight"
import { judgeInfo, judgeTask, type JudgeSettings } from "./judge"
import { redact, stamp } from "./run"

export async function calibrate(config: EvalConfig) {
  const tasks = await loadTasks(config.tasksDir, config.only)
  await preflight(config, parseArtifactSource("docker", config.loginom))
  const judge = await judgeInfo(config)
  const runId = `${stamp(new Date())}-calibrate`
  const runDir = path.join(config.resultsDir, runId)
  await mkdir(runDir, { recursive: true })
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify(redact(config), null, 2))
  const settings: JudgeSettings = {
    command: config.judge.command,
    model: config.judge.model,
    reasoning: config.judge.reasoning,
    timeoutMs: config.judgeTimeoutMs,
    passThreshold: config.passThreshold,
  }
  const rows: { task: string; kind: "positive" | "negative"; reference: string; score: number | null; failed: string[]; error: string | null }[] = []
  for (const [index, task] of tasks.entries()) {
    // negative — эталон следующей задачи по кругу: судья обязан заметить подмену.
    const negative = tasks.length > 1 ? tasks[(index + 1) % tasks.length] : undefined
    const checklist = task.checklist.filter((item) => !item.requiresResultFile)
    for (const [kind, reference] of [["positive", task], ["negative", negative]] as const) {
      if (!reference) continue
      const attemptDir = path.join(runDir, task.id, kind)
      const artifactDir = path.join(attemptDir, "artifact")
      await mkdir(path.join(artifactDir, "results"), { recursive: true })
      await cp(path.join(reference.dir, reference.reference), path.join(artifactDir, "package.lgp"))
      await unzip(path.join(artifactDir, "package.lgp"), path.join(artifactDir, "unpacked"))
      const judged = await judgeTask({ task, artifactDir, prompt: task.prompt, outDir: path.join(attemptDir, "judge"), judge: settings, checklist })
      rows.push({
        task: task.id,
        kind,
        reference: reference.id,
        score: judged.ok ? judged.score : null,
        failed: judged.ok ? judged.items.filter((item) => !item.passed).map((item) => item.id) : [],
        error: judged.ok ? null : judged.error,
      })
      console.error(`[calibrate ${task.id}/${kind}] score=${judged.ok ? judged.score : "error"}`)
    }
  }
  const { positiveMin, negativeMax } = config.calibration
  const warnings = rows.flatMap((row) => {
    if (row.score === null) return [`${row.task}/${row.kind}: судья не дал вердикт (${row.error})`]
    if (row.kind === "positive" && row.score < positiveMin)
      return [`${row.task}/positive: ${row.score} < ${positiveMin}; непройдены: ${row.failed.join(", ") || "—"}`]
    if (row.kind === "negative" && row.score > negativeMax)
      return [`${row.task}/negative (эталон ${row.reference}): ${row.score} > ${negativeMax} — судья не заметил подмену`]
    return []
  })
  await Bun.write(
    path.join(runDir, "calibration.json"),
    JSON.stringify({ run_id: runId, judge, rubric_hash: await rubricHash(tasks), thresholds: config.calibration, rows, warnings }, null, 2),
  )
  const report = [
    `# Калибровка судьи ${runId}`,
    "",
    `Судья: ${judge.model}/${judge.reasoning} (${judge.codex_version ?? "?"}). Пороги: positive ≥ ${positiveMin}, negative ≤ ${negativeMax}.`,
    "",
    "| Задача | Вид | Эталон | score | Непройдено |",
    "|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.task} | ${row.kind} | ${row.reference} | ${row.score ?? "—"} | ${row.failed.join(", ") || "—"} |`),
    "",
    warnings.length ? "## Предупреждения" : "## Пороги выполнены",
    "",
    ...warnings.map((warning) => `- ${warning}`),
    "",
  ].join("\n")
  await Bun.write(path.join(runDir, "calibration.md"), report)
  console.log(report)
  return { code: 0, runDir }
}
```

Run: `bun test test/calibrate.test.ts` → PASS.

- [ ] **Шаг 9.4: коммит**

```bash
bun typecheck && bun test
git add evals/src/rejudge.ts evals/src/calibrate.ts evals/src/run.ts evals/test/rejudge.test.ts evals/test/calibrate.test.ts
git commit -m "feat(evals): judge-only rescoring and judge calibration modes"
```

---

### Task 10: Сравнение прогонов (`compare.ts`)

**Files:**
- Create: `evals/src/compare.ts`
- Test: `evals/test/compare.test.ts`

**Interfaces:**
- Produces: `compare(a: RunSummary, b: RunSummary) → string` (markdown); entry `bun run src/compare.ts <run-a> <run-b>` пишет `results/compare-<a>-vs-<b>.md`.

- [ ] **Шаг 10.1 (RED): tracer bullet — дельты и несравнимость**

`evals/test/compare.test.ts`:

```ts
import { expect, test } from "bun:test"
import { compare } from "../src/compare"
import { aggregate, aggregateTask, type AttemptResult, type RunSummary } from "../src/report"

const attempt = (over: Partial<AttemptResult>): AttemptResult => ({
  task_id: "group-sum-qty", attempt: 1, status: "completed", exit_code: 0, timed_out: false, interrupted: false, failure_kind: null,
  score: 70, pass: true, judge_status: "scored", judge_attempts: 1, judge_confidence: "high", judge_summary: null, checklist: null,
  duration_ms: 1000, cost: 0.01, tokens: { input: 1, output: 1, reasoning: 0 }, counters: { toolCalls: 1, loginomToolCalls: 1, toolErrors: 0, memoryToolCalls: 0 },
  package_path: null, artifact_origin: null, artifact_ambiguous: [], cleanup_error: null, action_manifest_sha256: null, session_id: null,
  profile_recovered: false, errors: [], harness_error: null, ...over,
})

const summary = (attempts: AttemptResult[], over: Partial<RunSummary> = {}): RunSummary => ({
  run_id: "a", label: null, started_at: "", finished_at: "", interrupted: false, interrupted_cleanup: null, stopped_reason: null,
  agent: { cli_mode: "source", git_sha: "1", dirty: false, model: "openai/gpt-5.6-sol" },
  judge: { backend: "codex", codex_version: "v", model: "gpt-6-astra", reasoning: "high", prompt_sha256: "p" },
  dock: { skill_revision: "r1", action_manifest_sha256: ["m"] }, loginom: { image_digest: "d" },
  agent_inputs_hash: "i", rubric_hash: "r", task_ids: ["group-sum-qty"],
  config: { repeat: 1, timeout_ms: 1, judge_timeout_ms: 1, pass_threshold: 70, keep_storage: false },
  metrics: aggregate(attempts, false), tasks: [{ id: "group-sum-qty", metrics: aggregateTask(attempts, false), attempts }], storage_leftovers: [], ...over,
})

test("compare: дельты метрик со стрелками", () => {
  const text = compare(summary([attempt({ score: 50 })], { run_id: "a" }), summary([attempt({ score: 90 })], { run_id: "b" }))
  expect(text).toContain("mean_score")
  expect(text).toContain("50.0 → 90.0 ▲")
  expect(text).not.toContain("несравнимы")
})

test("compare: разный судья — предупреждение о несравнимости первой строкой; разный Dock — предупреждение об окружении", () => {
  const a = summary([attempt({})])
  const b = summary([attempt({})], { judge: { ...a.judge!, model: "gpt-5.5" }, dock: { skill_revision: "r2", action_manifest_sha256: ["m"] } })
  const text = compare(a, b)
  expect(text.split("\n")[0]).toContain("несравнимы")
  expect(text).toContain("judge.model")
  expect(text).toContain("изменилось окружение")
  expect(text).toContain("dock.skill_revision")
})

test("compare: прерванный прогон — предупреждение о неполном покрытии", () => {
  const text = compare(summary([attempt({})]), summary([attempt({})], { interrupted: true }))
  expect(text).toContain("неполное покрытие")
})
```

Run: `bun test test/compare.test.ts` → FAIL.

- [ ] **Шаг 10.2 (GREEN): `compare.ts`**

```ts
import path from "node:path"
import { evalsRoot } from "./config"
import { EvalFailure } from "./fail"
import type { RunSummary } from "./report"

const arrow = (delta: number) => (delta > 0 ? "▲" : delta < 0 ? "▼" : "=")
const num = (x: number | null, y: number | null, digits = 1) =>
  x === null || y === null ? "—" : `${x.toFixed(digits)} → ${y.toFixed(digits)} ${arrow(y - x)}`
const pct = (x: number | null, y: number | null) =>
  x === null || y === null ? "—" : `${(x * 100).toFixed(1)}% → ${(y * 100).toFixed(1)}% ${arrow(y - x)}`

export function compare(a: RunSummary, b: RunSummary) {
  const identity: [string, unknown, unknown][] = [
    ["agent.model", a.agent.model, b.agent.model],
    ["agent_inputs_hash", a.agent_inputs_hash, b.agent_inputs_hash],
    ["rubric_hash", a.rubric_hash, b.rubric_hash],
    ["judge.model", a.judge?.model ?? null, b.judge?.model ?? null],
    ["judge.reasoning", a.judge?.reasoning ?? null, b.judge?.reasoning ?? null],
    ["judge.prompt_sha256", a.judge?.prompt_sha256 ?? null, b.judge?.prompt_sha256 ?? null],
    ["pass_threshold", a.config.pass_threshold, b.config.pass_threshold],
  ]
  const environment: [string, unknown, unknown][] = [
    ["dock.skill_revision", a.dock.skill_revision, b.dock.skill_revision],
    ["dock.action_manifest_sha256", a.dock.action_manifest_sha256.join(","), b.dock.action_manifest_sha256.join(",")],
    ["loginom.image_digest", a.loginom.image_digest, b.loginom.image_digest],
  ]
  const mismatches = identity.filter(([, x, y]) => x !== y)
  const changed = environment.filter(([, x, y]) => x !== y)
  const judgeless = a.judge === null && b.judge === null
  const partial = [a, b].filter((run) => run.interrupted || run.stopped_reason)
  const lines = [
    ...(mismatches.length
      ? [`**ПРОГОНЫ НЕСРАВНИМЫ:** различаются ${mismatches.map(([name, x, y]) => `${name} (${String(x)} → ${String(y)})`).join("; ")}`, ""]
      : []),
    `# Сравнение ${a.run_id}${a.label ? ` (${a.label})` : ""} → ${b.run_id}${b.label ? ` (${b.label})` : ""}`,
    "",
    `Повторов: ${a.config.repeat} → ${b.config.repeat}. Попыток: ${a.metrics.total} → ${b.metrics.total}.`,
    ...(partial.length ? [`**Неполное покрытие:** ${partial.map((run) => `${run.run_id} (${run.interrupted ? "прерван" : run.stopped_reason})`).join(", ")} — метрики по разному числу попыток.`] : []),
    ...(changed.length ? [`**Изменилось окружение:** ${changed.map(([name, x, y]) => `${name} (${String(x)} → ${String(y)})`).join("; ")}. Сравнение допустимо, но часть дельты может объясняться Dock/Loginom.`] : []),
    ...(judgeless ? ["Оба прогона без судьи: сравнение только по completion_rate."] : []),
    "",
    "## Метрики",
    "",
    "| Метрика | a → b |",
    "|---|---|",
    `| completion_rate | ${pct(a.metrics.completion_rate, b.metrics.completion_rate)} |`,
    ...(judgeless
      ? []
      : [
          `| mean_score | ${num(a.metrics.mean_score, b.metrics.mean_score)} |`,
          `| mean_score_completed | ${num(a.metrics.mean_score_completed, b.metrics.mean_score_completed)} |`,
          `| pass_rate | ${pct(a.metrics.pass_rate, b.metrics.pass_rate)} |`,
        ]),
    `| tool_errors | ${num(a.metrics.tool_errors, b.metrics.tool_errors, 0)} |`,
    `| total_cost | ${num(a.metrics.total_cost, b.metrics.total_cost, 4)} |`,
    "",
    "## Задачи",
    "",
    "| Задача | completion a → b | mean_score a → b | разброс a | разброс b |",
    "|---|---|---|---|---|",
    ...[...new Set([...a.task_ids, ...b.task_ids])].map((id) => {
      const x = a.tasks.find((task) => task.id === id)?.metrics
      const y = b.tasks.find((task) => task.id === id)?.metrics
      const spread = (m?: RunSummary["tasks"][number]["metrics"]) =>
        m && m.min_score !== null && m.max_score !== null ? `${m.min_score}–${m.max_score}` : "—"
      return `| ${id} | ${pct(x?.completion_rate ?? null, y?.completion_rate ?? null)} | ${num(x?.mean_score ?? null, y?.mean_score ?? null)} | ${spread(x)} | ${spread(y)} |`
    }),
    "",
  ]
  return lines.join("\n")
}

if (import.meta.main) {
  const [first, second] = Bun.argv.slice(2)
  if (!first || !second) {
    console.error("Использование: bun run src/compare.ts <run-a> <run-b>")
    process.exit(2)
  }
  const read = async (id: string) => {
    const file = Bun.file(path.join(evalsRoot, "results", id, "summary.json"))
    if (!(await file.exists())) throw new EvalFailure(`Нет summary.json для прогона ${id}`, 2)
    return (await file.json()) as RunSummary
  }
  Promise.all([read(first), read(second)])
    .then(async ([a, b]) => {
      const text = compare(a, b)
      await Bun.write(path.join(evalsRoot, "results", `compare-${first}-vs-${second}.md`), text)
      console.log(text)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(error instanceof EvalFailure ? error.exitCode : 1)
    })
}
```

Run: `bun test test/compare.test.ts` → PASS.

- [ ] **Шаг 10.3: коммит**

```bash
bun typecheck && bun test
git add evals/src/compare.ts evals/test/compare.test.ts
git commit -m "feat(evals): compare two eval runs with comparability checks"
```

---

### Task 11: Dev-bundle, документация, живая приёмка

**Files:**
- Create: `evals/script/prepare-bundle.ts`, `evals/README.md`, `evals/AGENTS.md`
- Modify: `AGENTS.md` (корень репозитория): одна строка в module map
- Modify: `docs/superpowers/specs/2026-09-18-evals-design.md` — раздел «Прогресс»

- [ ] **Шаг 11.1: `prepare-bundle.ts`**

```ts
import path from "node:path"
import { cp, mkdir, rm, stat, symlink } from "node:fs/promises"

const copy = Bun.argv.includes("--copy")
const evalsRoot = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(evalsRoot, "..")
const bundle = path.join(evalsRoot, ".bundle")
const resources = path.join(repoRoot, "packages", "desktop", "resources", "loginom")

await mkdir(bundle, { recursive: true })
for (const name of ["bin", "browsers", "runtime"]) {
  const source = path.join(resources, name)
  if (!(await stat(source).catch(() => undefined))) {
    console.error(`Нет ${source}: ресурсы Desktop не подготовлены (см. packages/desktop/AGENTS.md)`)
    process.exit(2)
  }
  const target = path.join(bundle, name)
  await rm(target, { recursive: true, force: true })
  if (copy) await cp(source, target, { recursive: true })
  else await symlink(source, target)
}
await rm(path.join(bundle, "host"), { recursive: true, force: true })
const build = Bun.spawn(["bun", "script/build-node-host.ts", path.join(bundle, "host")], {
  cwd: path.join(repoRoot, "packages", "loginom-host"),
  stdout: "inherit",
  stderr: "inherit",
})
if ((await build.exited) !== 0) {
  console.error("Сборка host не удалась")
  process.exit(1)
}
console.log(`Dev-bundle готов: ${bundle}`)
console.log("После изменений в packages/loginom-host выполните снова: bun run prepare-bundle")
```

Run: `cd evals && bun run prepare-bundle && ls -la .bundle && ls .bundle/host`
Expected: симлинки `bin`, `browsers`, `runtime`; `host/node-host.mjs` существует. Если позже preflight или host отвергают симлинки — `bun run prepare-bundle --copy`.

- [ ] **Шаг 11.2: `README.md` и `AGENTS.md`**

`evals/README.md`:

```markdown
# Eval harness Loginom AI Agent

Измеряет, стал ли агент строить сценарии Loginom лучше или хуже: прогоняет задачи через standalone CLI, забирает `.lgp` из локального Loginom, оценивает судьёй `codex exec`. Дизайн: `docs/superpowers/specs/2026-09-18-evals-design.md`.

## Предпосылки

- Bun ≥ 1.3, `unzip`, `git`, `pgrep`, `docker`.
- Локальный стенд Loginom в docker (`loginom-server-master`, `http://localhost/app/`, пользователь `user`).
- Отдельный API-ключ Dock для eval (не ключ Desktop): память OpenViking привязана к ключу.
- Codex CLI с входом по подписке (`codex login`); судья — `gpt-6-astra`/`high`.
- Dev-bundle: `bun run prepare-bundle` (симлинки ресурсов Desktop + сборка host). Повторять после изменений в `packages/loginom-host`.

## Настройка

```bash
cd evals
bun install
cp .env.example .env   # заполнить LOGINOM_DOCK_API_KEY
bun run prepare-bundle
# одноразовый вход провайдера агента в eval-профиль (команду печатает harness при первом запуске):
LOGINOM_AI_AGENT_CLI_PROFILE=$PWD/.profile/agent LOGINOM_AI_AGENT_CLI_BUNDLE=$PWD/.bundle \
  bun run --cwd ../packages/agent dev:cli providers login
```

## Команды

```bash
bun test && bun typecheck                    # самопроверка harness
bun run src/run.ts --dry-run --repeat 2      # весь цикл на фикстурах, без Loginom/модели/квоты
bun run src/run.ts --calibrate               # калибровка судьи на эталонах (без агента)
bun run src/run.ts --repeat 3 --label base   # живой прогон
bun run src/run.ts --judge-only <run-id>     # пересудить готовые артефакты
bun run src/compare.ts <run-a> <run-b>       # сравнить два прогона
```

Флаги: `--only a,b`, `--tasks <dir>`, `--timeout-ms`, `--skip-judge`, `--keep-storage`, `--reset-profile`.

## Что означают статусы

`completed` — код 0 и `.lgp` получен; `no_artifact` — код 0 без пакета (score 0); `failed` — код 1/4/130 (`failure_kind`: permission/recovery/cancelled/provider/tool/other); `timeout`; `interrupted` (Ctrl+C, не считается); `harness_error` — проблема harness/профиля, коды 2/3 останавливают прогон.

Известные причины `CLI_PERMISSION_REJECTED` (→ `failed/permission`): агент запросил `question`, зациклился (`doom_loop`) или обратился вне workspace (`external_directory`) — в headless-режиме такие запросы отклоняются автоматически.

## Сравнимость

`compare` предупреждает, если различаются модель агента, входы задач, рубрика, судья или порог. Смена Dock-skill/образа Loginom — отдельное предупреждение «изменилось окружение».

## Очистка хранилища

Скопированные артефакты удаляются автоматически (`--keep-storage` отключает). Остатки перечислены в `report.md`; снять всё по прогону:

```bash
docker exec loginom-server-master sh -c 'rm -f /workdir/UserStorage/user/eval-<run-id>-*'
```

## Ориентир шума

Заполняется после первого живого `--repeat 3` (пункт 5 приёмки в спеке): по задачам `min–max score` и `completed/attempts`.
```

`evals/AGENTS.md`:

```markdown
# Eval harness

- Весь код harness живёт здесь; остальной репозиторий не менять. Runtime-зависимостей нет; dev-зависимости ставятся `bun install` в этом каталоге.
- Разработка строго по TDD (`/tdd`): один падающий тест поведения → минимальная реализация → зелёный → коммит. Тесты через публичные интерфейсы модулей из спеки; без моков и `globalThis.*`. Внешние процессы подменяются только `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND`.
- Команды выполняются из `evals/`: `bun test`, `bun typecheck`, `bun run src/run.ts`. Из корня репозитория тесты не запускать.
- Контракт данных (статусы, `judge_status`, `failure_kind`, поля `summary.json`) описан в `docs/superpowers/specs/2026-09-18-evals-design.md`; при расхождении сначала правится спека.
- Секреты не попадают в `results/`, логи и сообщения ошибок. `results/`, `.profile/`, `.bundle/`, `.env` — gitignored.
- Живой судья (`codex exec`) в тестах не вызывается; проверяется через `fixtures/fake-codex.ts`.
```

Корневой `AGENTS.md`, в список module map после строки `- [Model/backend integration](packages/agent/AGENTS.md)`:

```markdown
- [Eval harness for Loginom scenarios](evals/AGENTS.md)
```

```bash
git add evals/script/prepare-bundle.ts evals/README.md evals/AGENTS.md AGENTS.md
git commit -m "docs(evals): dev-bundle script, harness README and module rules"
```

- [ ] **Шаг 11.3: приёмка 1 — самопроверка**

Run: `cd evals && bun test && bun typecheck && bun run src/run.ts --dry-run --repeat 2`
Expected: все тесты PASS; dry-run печатает отчёт с `completion_rate: 33.3% (2/6)`, `mean_score: —`.

- [ ] **Шаг 11.4: приёмка 2 — калибровка живого судьи**

Run: `bun run src/run.ts --calibrate`
Expected: `calibration.md` с `positive ≥ 90` и `negative ≤ 40` для трёх задач. Если порог нарушен — править формулировки пунктов `checklist` (`tasks/*/task.json`) или `src/judge-prompt.md`, повторять калибровку до выполнения; каждое изменение рубрики — отдельный коммит `docs(evals): tune checklist …`.

- [ ] **Шаг 11.5: приёмка 3 — живой прогон**

Предварительно: `.env` заполнен (отдельный ключ Dock, `EVAL_AGENT_MODEL=openai/gpt-5.6-sol`), `providers login` выполнен в eval-профиле, стенд Loginom запущен.

Run: `bun run src/run.ts --repeat 3 --label baseline`
Expected: ≤ 2.25 ч; `results/<run-id>/summary.json`, `report.md`, девять `result.json`; для попыток с артефактом — `judge/verdict.json`; раздел «Остатки в хранилище» в отчёте либо пуст, либо перечисляет `.~lgp` и файлы попыток без артефакта.

Если `assertAuth` падает — выполнить напечатанную команду `providers login`; если OAuth в CLI не работает — заполнить `EVAL_AGENT_PROVIDER_*` (MiMo) и `EVAL_AGENT_MODEL=xiaomi-token-plan-sgp/mimo-v2.5-pro`, зафиксировать это в разделе «Прогресс» спеки.

- [ ] **Шаг 11.6: приёмка 4 — пересуживание**

Run: `bun run src/run.ts --judge-only <run-id>`
Expected: те же score при неизменной рубрике (сравнить `summary.prev.json` и `summary.json`); `judge/verdict.prev.json` рядом с новым вердиктом.

- [ ] **Шаг 11.7: приёмка 5 — ориентир шума и прогресс**

Из `summary.json` живого прогона: по каждой задаче `min_score`–`max_score` и `completed/attempts` → раздел «Ориентир шума» в `evals/README.md`. Заменить синтетические фикстуры `fixtures/events/*.jsonl` очищенными фрагментами реальных `events.jsonl` (без секретов и персональных данных), прогнать `bun test`.

Дописать в спеку раздел «Прогресс»: дата, run-id, метрики, уровень шума, модель агента/судьи, отклонения от плана.

```bash
git add evals/README.md evals/fixtures/events docs/superpowers/specs/2026-09-18-evals-design.md
git commit -m "docs(evals): record baseline run, noise floor and real event fixtures"
```

---

## Self-review плана

- **Покрытие спеки:** статусы и приоритеты (задача 5), `failure_kind` и счётчики (3), попытки round-robin и `--repeat` (7), Ctrl+C/`interrupted`/`stopped_reason` (7), профиль и восстановление (6), артефакт и автоочистка (4, 7), судья с повтором, `node-readbacks.md`, `judgedFields` (8), `--judge-only` с prev-файлами (9), `--calibrate` с `requires_result_file` (9), сравнимость и окружение (10), dev-bundle/README/AGENTS (11), приёмка 1–5 (11). Хвост промпта без имён инструментов (7). Секреты — `redact` (7), проверка вывода setup (6).
- **Типы между задачами:** `AttemptResult` (5) используется в 7, 9, 10 с одинаковыми полями; `Judged`/`judgedFields` (8) — в 7 и 9; `JudgeSettings.env` — в 8 и тестах; `Environment` nullable (6) — в 7.
- **Известные компромиссы:** `judge/events-<n>.jsonl`/`stderr-<n>.txt` вместо единого `events.jsonl` из спеки — из-за повтора судьи; `AttemptResult` содержит `task_id` и `errors`, которых нет в перечне полей `summary.tasks[].attempts[]` спеки — это надмножество. Оба отражены здесь и не требуют правки спеки.
