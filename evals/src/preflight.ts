import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, rm, stat, realpath, statfs } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { evalsRoot, repoRoot } from "./config"
import { EvalFailure } from "./fail"
import { listStorage, type ArtifactSource } from "./artifact"
import { agentCommand } from "./cli"
import { sandboxCommand, SandboxFailure, assertNoDebuggers } from "./sandbox"
import { superviseProcess } from "./process-supervisor"

export type Environment = {
  git: { sha: string; dirty: boolean } | null
  agent: Awaited<ReturnType<typeof agentInfo>> | null
  codex: { version: string } | null
  dock: { skillRevision: string | null } | null
  loginom: { imageDigest: string | null } | null
}

export async function preflight(config: EvalConfig, source: ArtifactSource): Promise<Environment> {
  const environment: Environment = { git: await gitInfo(), agent: null, codex: null, dock: null, loginom: null }
  if (config.dryRun) {
    await requireFixtures()
    return environment
  }
  if (!config.skipJudge) environment.codex = await codexInfo(config.judge.command)
  // --judge-only и --calibrate не запускают агента: Loginom, docker, Dock и bundle не нужны.
  if (config.judgeOnly !== undefined || config.calibrate) return environment
  if (config.agent.cliMode === "source")
    throw new EvalFailure("Изолированный live eval требует EVAL_CLI_MODE=binary и EVAL_CLI_BIN установленного CLI", 2)
  if (config.agent.cliMode === "binary") {
    await assertNoDebuggers()
    await checkSandbox(config)
  }
  for (const tool of source.kind === "docker" ? ["unzip", "git", "pgrep", "ps", "docker"] : ["unzip", "git", "pgrep", "ps"]) {
    if (!Bun.which(tool)) throw new EvalFailure(`Не найдена команда ${tool}`, 2)
  }
  const page = await fetch(config.loginom.url, { signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
  if (page?.status !== 200)
    throw new EvalFailure(`Loginom недоступен: ${config.loginom.url} → ${page?.status ?? "нет ответа"}`, 2)
  if (source.kind === "docker") environment.loginom = { imageDigest: await containerDigest(source.container) }
  await checkStorage(source)
  environment.dock = { skillRevision: await dockSkillRevision(config.dock) }
  if (config.agent.cliMode === "binary" && !(await Bun.file(config.agent.cliBin ?? "").exists()))
    throw new EvalFailure(`EVAL_CLI_BIN не найден: ${config.agent.cliBin}`, 2)
  environment.agent = await agentInfo(config)
  await mkdir(config.agent.workspaceRoot, { recursive: true })
  await checkFreeSpace(evalsRoot)
  await checkFreeSpace(config.agent.workspaceRoot)
  return environment
}

export async function checkSandbox(config: EvalConfig) {
  await mkdir(config.profileDir, { recursive: true })
  await mkdir(config.agent.workspaceRoot, { recursive: true })
  const workdir = await mkdtemp(path.join(config.agent.workspaceRoot, ".sandbox-check-"))
  try {
    const command = agentCommand(config)
    const cmd = [...command.cmd, "--version"]
    const boundary = await sandboxCommand({ cmd, profileDir: config.profileDir, workdir, env: command.env })
    const run = await superviseProcess({ cmd, cwd: boundary.cwd, env: boundary.env, sandbox: boundary.cmd, timeoutMs: 10_000 })
    if (run.exitCode !== 0 || run.sandboxError || run.processCleanup.status !== "confirmed")
      throw new SandboxFailure("проверка команды запуска bubblewrap не пройдена")
  } catch (error) {
    if (error instanceof SandboxFailure) throw error
    throw new SandboxFailure("не удалось подготовить установленный CLI и точные mounts")
  } finally { await rm(workdir, { recursive: true, force: true }) }
}

export async function checkFreeSpace(dir: string, minBytes = 1024 ** 3) {
  const filesystem = await statfs(dir)
  const available = filesystem.bavail * filesystem.bsize
  if (available < minBytes)
    throw new EvalFailure(`Недостаточно свободного места в ${dir}: ${available} байт, требуется ${minBytes}`, 2)
}

export async function agentInfo(config: EvalConfig) {
  if (config.agent.cliMode !== "binary") return {
    cliVersion: null,
    binaryPath: null,
    binarySha256: null,
    sourceCommit: null,
    sourceDirty: null,
    sourceTreeSha256: null,
  }
  const binaryPath = await realpath(path.resolve(evalsRoot, config.agent.cliBin ?? "")).catch(() => undefined)
  if (!binaryPath) throw new EvalFailure(`EVAL_CLI_BIN не найден: ${config.agent.cliBin}`, 2)
  const hasher = new Bun.CryptoHasher("sha256")
  for await (const chunk of Bun.file(binaryPath).stream()) hasher.update(chunk)
  const manifest = await Bun.file(path.join(path.dirname(path.dirname(binaryPath)), "cli-manifest.json"))
    .json().catch(() => undefined) as { metadata?: Record<string, unknown> } | undefined
  const metadata = manifest?.metadata
  return {
    cliVersion: typeof metadata?.version === "string" ? metadata.version : null,
    binaryPath,
    binarySha256: hasher.digest("hex"),
    sourceCommit: typeof metadata?.sourceCommit === "string" ? metadata.sourceCommit : null,
    sourceDirty: typeof metadata?.sourceDirty === "boolean" ? metadata.sourceDirty : null,
    sourceTreeSha256: typeof metadata?.sourceTreeSha256 === "string" ? metadata.sourceTreeSha256 : null,
  }
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
  if (path.basename(command[0] ?? "") === "codex" && !(await Bun.file(path.join(home, "auth.json")).exists()))
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

export async function dockSkillRevision(dock: { apiKey: string; baseUrl: string }): Promise<string> {
  const health = await fetch(`${dock.baseUrl}/health`, { signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
  if (health?.status !== 200)
    throw new EvalFailure(`Dock недоступен: ${dock.baseUrl}/health → ${health?.status ?? "нет ответа"}`, 2)
  // Без include_integrity Dock не возвращает result.revision; параметры совпадают с runtime skill.mjs.
  const url = new URL(`${dock.baseUrl}/api/v1/skills/loginom-automation`)
  url.searchParams.set("target_uri", "viking://agent/skills/loginom-automation")
  url.searchParams.set("include_files", "true")
  url.searchParams.set("include_integrity", "true")
  const manifest = await fetch(url, {
    headers: { Authorization: `Bearer ${dock.apiKey}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
  if (manifest?.status === 401 || manifest?.status === 403)
    throw new EvalFailure("Dock отклонил LOGINOM_DOCK_API_KEY (401/403)", 2)
  if (manifest?.status !== 200)
    throw new EvalFailure(`Манифест skill недоступен: ${manifest?.status ?? "нет ответа"}`, 2)
  const body = (await manifest.json().catch(() => undefined)) as
    | { revision?: unknown; result?: { revision?: unknown }; status?: unknown; error?: unknown }
    | undefined
  const revision = body?.revision ?? body?.result?.revision
  if (typeof revision === "string" || typeof revision === "number") return String(revision)
  throw new EvalFailure(`Манифест skill без revision: status=${String(body?.status)} error=${String(body?.error ?? "—")}`, 2)
}

export async function checkStorage(source: ArtifactSource) {
  const listed = await listStorage(source).then(
    () => undefined,
    (error: unknown) => error,
  )
  if (listed === undefined) return
  throw new EvalFailure(`Хранилище Loginom недоступно: ${listed instanceof Error ? listed.message : String(listed)}`, 2)
}

async function requireFixtures() {
  for (const rel of ["fixtures/fake-cli.ts", "fixtures/fake/default.jsonl", "fixtures/storage"]) {
    if (!(await stat(path.join(evalsRoot, rel)).catch(() => undefined))) throw new EvalFailure(`Нет фикстуры ${rel}`, 2)
  }
}
