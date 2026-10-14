import path from "node:path"
import os from "node:os"
import { lstat, mkdir, mkdtemp, readlink, readdir, rm, stat, realpath, statfs } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { evalsRoot, repoRoot } from "./config"
import { EvalFailure } from "./fail"
import { assertIsolatedStorageEmpty, listStorage, type ArtifactSource } from "./artifact"
import { agentCommand } from "./cli"
import { sandboxCommand, SandboxFailure, assertNoDebuggers } from "./sandbox"
import { superviseProcess } from "./process-supervisor"
import { judgeEnvironment, judgeVersion, type JudgeSettings } from "./judge"

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
  if (!config.skipJudge) environment.codex = await codexInfo(config.judge)
  // --judge-only и --calibrate не запускают агента: Loginom, docker, Dock и bundle не нужны.
  if (config.judgeOnly !== undefined || config.calibrate) return environment
  if (config.agent.cliMode === "source")
    throw new EvalFailure("Изолированный live eval требует EVAL_CLI_MODE=binary и EVAL_CLI_BIN установленного CLI", 2)
  if (config.agent.cliMode === "binary") {
    await checkIsolatedLoginom(source)
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

export async function checkIsolatedLoginom(source: ArtifactSource) {
  const storage = await assertIsolatedStorageEmpty(source)
  const read = await Bun.$`docker exec ${storage.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet().nothrow()
  const marker = await Promise.resolve(read.text()).then((text) => JSON.parse(text)).catch(() => undefined) as
    { previous_container_id?: unknown } | undefined
  if (!marker || typeof marker !== "object" || Array.isArray(marker))
    throw new EvalFailure("Маркер подготовки не определяет прежний сервер Loginom", 2)
  // A fresh dedicated host has no predecessor; a declared predecessor still needs retirement proof.
  if (marker.previous_container_id !== undefined) {
    if (typeof marker.previous_container_id !== "string" || !/^[0-9a-f]{64}$/.test(marker.previous_container_id) || marker.previous_container_id === storage.containerId)
      throw new EvalFailure("Маркер подготовки не определяет прежний сервер Loginom", 2)
    const previous = await Bun.$`docker inspect --format ${"{{.State.Running}}\t{{.HostConfig.RestartPolicy.Name}}"} ${marker.previous_container_id}`.quiet().nothrow()
    if (previous.exitCode !== 0 || previous.text().trim() !== "false\tno")
      throw new EvalFailure("Изолированный eval запрещён: прежний сервер не остановлен или его автоперезапуск включён", 2)
  }
  const components = await Bun.$`docker exec ${storage.containerId} cat /workdir/Components.cfg`.quiet().nothrow()
  const disabled = components.exitCode === 0 && Bun.which("xmllint")
    ? await Bun.$`printf %s ${components.text()} | xmllint --xpath ${"boolean(/ComponentSettings/Item[@Guid='70a6c99d-a725-4309-b05c-898c8072c3cd']/Settings[@Disabled='true'])"} -`.quiet().nothrow()
    : undefined
  if (disabled?.exitCode !== 0 || disabled.text().trim() !== "true")
    throw new EvalFailure("Изолированный eval требует явно выключенный Python в Components.cfg (проверка xmllint)", 2)
  const inspected = await Bun.$`docker inspect --format ${'{{json (index .NetworkSettings.Networks "loginom-net")}}'} ${storage.containerId}`.quiet().nothrow()
  const network = inspected.exitCode === 0 ? inspected.json() as { Aliases?: string[] } | null : null
  if (!network?.Aliases?.includes("loginom-server-7.4.2-test"))
    throw new EvalFailure("Изолированный Loginom требует network alias loginom-server-7.4.2-test в loginom-net для Studio", 2)
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

export async function verifyAdminRuntime(binary: string) {
  const installation = path.dirname(path.dirname(await realpath(binary)))
  if (installation === repoRoot || installation.startsWith(repoRoot + path.sep)) throw new EvalFailure("ADMIN_RUNTIME_PATH", 2)
  const resources = path.join(installation, "resources/loginom")
  const resource = (await runtimeDocument(path.join(resources, "resource-manifest.json"))).value
  const document = await runtimeDocument(path.join(installation, "cli-manifest.json"))
  const manifest = document.value
  if (!runtimeObject(resource) || !runtimeObject(manifest) || manifest.format !== "loginom-cli-artifact-v1" || !runtimeObject(manifest.metadata) ||
    typeof resource.node !== "string" || typeof resource.browser !== "string" ||
    typeof manifest.metadata.sourceCommit !== "string" || !/^[a-f0-9]{40}$/.test(manifest.metadata.sourceCommit) ||
    typeof manifest.metadata.sourceTreeSha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.metadata.sourceTreeSha256)) throw new EvalFailure("ADMIN_RUNTIME_INVALID", 2)
  if (process.platform !== "linux" || process.arch !== "x64" || manifest.metadata.platform !== process.platform || manifest.metadata.arch !== process.arch ||
    resource.protocol !== 1 || resource.target !== `${process.platform}-${process.arch}`) throw new EvalFailure("ADMIN_RUNTIME_TARGET", 2)
  const entries = runtimeEntries(manifest.files, true)
  // Sequential streams bound open descriptors and memory for the browser/dependency inventory.
  for (const entry of entries) {
    const file = path.join(installation, entry.path)
    const canonical = await realpath(file)
    if (!canonical.startsWith(installation + path.sep)) throw new EvalFailure("ADMIN_RUNTIME_PATH", 2)
    const hash = new Bun.CryptoHasher("sha256")
    const info = await lstat(file)
    if ((!info.isFile() && !info.isSymbolicLink()) || (info.mode & 0o7777) !== entry.mode ||
      (info.isSymbolicLink() ? await readlink(file) : undefined) !== entry.link) throw new EvalFailure("ADMIN_RUNTIME_MODE", 2)
    if (info.isSymbolicLink() && (await stat(file)).isDirectory()) hash.update(await readlink(file))
    else for await (const chunk of Bun.file(file).stream()) hash.update(chunk)
    if (hash.digest("hex") !== entry.sha256) throw new EvalFailure("ADMIN_RUNTIME_HASH", 2)
  }
  const actual = (await runtimeInventory(installation)).filter(file => file !== "cli-manifest.json").sort()
  if (JSON.stringify(actual) !== JSON.stringify(entries.map(entry => entry.path).sort())) throw new EvalFailure("ADMIN_RUNTIME_INVENTORY", 2)
  if (![resource.node, resource.browser].every(runtimePath)) throw new EvalFailure("ADMIN_RUNTIME_PATH", 2)
  const claimed = new Map(entries.map(entry => [entry.path, entry]))
  for (const entry of runtimeEntries(resource.files, false)) {
    const outer = claimed.get(`resources/loginom/${entry.path}`)
    if (!outer || outer.sha256 !== entry.sha256 || outer.link !== entry.link) throw new EvalFailure("ADMIN_RUNTIME_RESOURCE", 2)
  }
  if (resource.nodeSha256 !== claimed.get(`resources/loginom/${resource.node}`)?.sha256 ||
    resource.browserSha256 !== claimed.get(`resources/loginom/${resource.browser}`)?.sha256 ||
    !["bin/loginom-ai-agent-cli", `resources/loginom/${resource.node}`, `resources/loginom/${resource.browser}`,
      "resources/loginom/resource-manifest.json", "resources/loginom/runtime/client/package.json",
      "resources/loginom/runtime/client/node_modules/playwright-core/package.json", "resources/loginom/runtime/client/node_modules/playwright-core/index.js"]
      .every(file => claimed.has(file))) throw new EvalFailure("ADMIN_RUNTIME_RESOURCE", 2)
  for (const file of [binary, path.join(resources, resource.node), path.join(resources, resource.browser)]) {
    if (!((await stat(file)).mode & 0o111)) throw new EvalFailure("ADMIN_RUNTIME_MODE", 2)
    const header = Buffer.from(await Bun.file(file).slice(0, 64).arrayBuffer())
    if (header.length !== 64 || !header.subarray(0, 6).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1])) || header.readUInt16LE(18) !== 62)
      throw new EvalFailure("ADMIN_RUNTIME_EXECUTABLE", 2)
  }
  return { installation, resources, node: path.join(resources, resource.node), browser: path.join(resources, resource.browser),
    clientPackage: path.join(resources, "runtime/client/package.json"),
    manifestHash: document.hash }
}

async function runtimeDocument(file: string) {
  const bytes = await Bun.file(file).arrayBuffer().catch(() => { throw new EvalFailure("ADMIN_RUNTIME_INVALID", 2) })
  try { return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown,
    hash: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") } }
  catch { throw new EvalFailure("ADMIN_RUNTIME_INVALID", 2) }
}

function runtimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function runtimeEntries(value: unknown, modes: boolean) {
  if (!Array.isArray(value) || !value.length || value.some(entry => !runtimeObject(entry) || typeof entry.path !== "string" ||
    typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    (modes && (typeof entry.mode !== "number" || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777)) ||
    (entry.link !== undefined && typeof entry.link !== "string"))) throw new EvalFailure("ADMIN_RUNTIME_INVALID", 2)
  const entries = value as { path: string; sha256: string; mode?: number; link?: string }[]
  if (new Set(entries.map(entry => entry.path)).size !== entries.length || entries.some(entry => !runtimePath(entry.path)))
    throw new EvalFailure("ADMIN_RUNTIME_PATH", 2)
  return entries
}

function runtimePath(value: string) {
  return !!value && !path.isAbsolute(value) && !value.includes("\\") && !value.split("/").some(part => !part || part === "." || part === "..")
}

async function runtimeInventory(directory: string, prefix = ""): Promise<string[]> {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return runtimeInventory(path.join(directory, entry.name), key)
    if (!entry.isFile() && !entry.isSymbolicLink()) throw new EvalFailure("ADMIN_RUNTIME_INVENTORY", 2)
    return [key]
  }))).flat()
}

export async function gitInfo() {
  const sha = await Bun.$`git rev-parse --short HEAD`.cwd(repoRoot).quiet().nothrow()
  if (sha.exitCode !== 0) return null
  const status = await Bun.$`git status --porcelain`.cwd(repoRoot).quiet().nothrow()
  return { sha: sha.text().trim(), dirty: status.text().trim().length > 0 }
}

async function codexInfo(judge: Pick<JudgeSettings, "command" | "env">) {
  const env = judgeEnvironment(judge.env)
  const version = await judgeVersion({ command: judge.command, env })
  if (version.exitCode !== 0)
    throw new EvalFailure(`Судья недоступен: ${judge.command.join(" ")} --version → код ${version.exitCode}`, 2)
  const home = env.CODEX_HOME ?? path.join(os.homedir(), ".codex")
  if (path.basename(judge.command[0] ?? "") === "codex" && !(await Bun.file(path.join(home, "auth.json")).exists()))
    throw new EvalFailure(`Нет входа Codex: отсутствует ${path.join(home, "auth.json")}. Выполните: codex login`, 2)
  return { version: version.stdout.trim() }
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
