import path from "node:path"
import { mkdir, rm, stat } from "node:fs/promises"
import { repoRoot, type EvalConfig } from "./config"
import type { AgentCommand } from "./cli"
import { EvalFailure } from "./fail"
import { groupProcesses } from "./process-group"

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
  const busy = await profileProcesses(profileDir)
  if (busy.trim()) throw new EvalFailure(`Профиль ${profileDir} занят процессами:\n${busy.trim()}`, 2)
  await rm(`${profileDir}.process-group`, { force: true })
  if (!(await exists(writer))) return false
  await rm(writer, { recursive: true, force: true })
  return true
}

export async function waitProfileIdle(profileDir: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await profileProcesses(profileDir)).trim()) return true
    await Bun.sleep(Math.min(2_000, Math.max(0, deadline - Date.now())))
  }
  return false
}

// Зарегистрированная группа включает host даже после завершения родительского CLI.
async function profileProcesses(profileDir: string) {
  const marker = Bun.file(`${profileDir}.process-group`)
  const group = (await marker.exists()) ? Number((await marker.text()).trim()) : undefined
  if (group !== undefined && (!Number.isInteger(group) || group <= 0))
    throw new EvalFailure(`Некорректная группа процессов профиля ${profileDir}`, 2)
  const tracked = group === undefined ? [] : await groupProcesses(group)
  const pattern = `${profileDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|[[:space:]]|$)`
  const result = await Bun.$`pgrep -u ${process.getuid?.() ?? ""} -f -- ${pattern}`.quiet().nothrow()
  if (result.exitCode > 1) throw new EvalFailure(`pgrep завершился кодом ${result.exitCode}`, 2)
  const owners = await linuxProfileOwners(profileDir)
  return [...tracked.map(String), ...owners.map(String), result.text().trim()].filter(Boolean).join("\n")
}

// CLI хранит профиль только в env, а runtime — в cwd; argv не доказывает idle.
async function linuxProfileOwners(profileDir: string) {
  if (process.platform !== "linux") return []
  const { readdir, readFile, readlink, realpath } = await import("node:fs/promises")
  const canonical = await realpath(profileDir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return path.resolve(profileDir)
    throw error
  })
  const readable = <T>(operation: Promise<T>, known: boolean) => operation.catch((error: NodeJS.ErrnoException) => {
    if (!known && ["EACCES", "EPERM"].includes(error.code ?? "")) return undefined
    throw error
  })
  const processes = await Promise.all((await readdir("/proc")).filter((pid) => /^\d+$/.test(pid)).map(async (pid) => {
    try {
      if ((await stat(`/proc/${pid}`)).uid !== process.getuid?.()) return undefined
      const status = await readFile(`/proc/${pid}/stat`, "utf8")
      const fields = status.slice(status.lastIndexOf(")") + 2).split(" ")
      if (["Z", "X"].includes(fields[0] ?? "")) return undefined
      const named = status.slice(status.indexOf("(") + 1, status.lastIndexOf(")")).startsWith("loginom-ai-")
      const args = ((await readable(readFile(`/proc/${pid}/cmdline`, "utf8"), named)) ?? "").split("\0")
      const host = args.slice(1).some((arg) => path.basename(arg) === "node-host.mjs")
      const cli = path.basename(args[0] ?? "") === "loginom-ai-agent-cli" || args.slice(1).some((arg) =>
        arg === "src/standalone.ts" || arg.endsWith("/packages/agent/src/standalone.ts"))
      const desktop = /^loginom-ai-agent(-dev|-beta)?$/.test(path.basename(args[0] ?? ""))
      const known = named || host || cli || desktop
      const environment = ((await readable(readFile(`/proc/${pid}/environ`, "utf8"), known)) ?? "").split("\0")
      const roots = environment.flatMap((entry) => {
        if (!/^LOGINOM_AI_AGENT_CLI_(PROFILE|ROOT)=/.test(entry)) return []
        return [entry.slice(entry.indexOf("=") + 1)]
      })
      const canonicalRoots = await Promise.all(roots.map((root) => realpath(root).catch(() => undefined)))
      const cwd = await readable(readlink(`/proc/${pid}/cwd`), known)
      return {
        pid: Number(pid), parent: Number(fields[1]),
        owns: canonicalRoots.includes(canonical) || roots.includes(canonical) || cwd === canonical || cwd?.startsWith(`${canonical}${path.sep}`),
        identified: canonicalRoots.some((root) => root !== undefined),
        host, cli, desktop,
      }
    } catch (error) {
      if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined
      throw new EvalFailure(`Не удалось проверить владельца профиля, PID ${pid}`, 2)
    }
  }))
  const live = processes.filter((entry) => entry !== undefined)
  return live.filter((entry) => {
    if (entry.owns || (entry.cli && !entry.identified)) return true
    if (!entry.host || entry.identified) return false
    const parent = live.find((candidate) => candidate.pid === entry.parent)
    // Без env host не раскрывает root; только живой известный parent доказывает чужой профиль.
    return !parent || (!parent.identified && !parent.desktop)
  }).map((entry) => entry.pid)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

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
  // Native embeds the product snapshot; source mode has no catalogue without this seed.
  const modelsCache = path.join(config.profileDir, "cache", "models.json")
  if (config.agent.cliMode === "source" && !(await exists(modelsCache))) {
    await mkdir(path.join(config.profileDir, "cache"), { recursive: true, mode: 0o700 })
    await Bun.write(modelsCache, Bun.file(path.join(repoRoot, "packages", "product", "models.json")))
  }
  const view = parseView((await management(command, ["loginom", "status", "--format", "json"])).stdout)
  const fresh = !view || view.state === "unconfigured" || view.hasApiKey === false
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
    const secrets = [config.dock.apiKey, config.loginom.password].filter((s) => s.length > 0)
    if (secrets.some((secret) => setup.stdout.includes(secret) || setup.stderr.includes(secret)))
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
      `Профиль Loginom не готов: state=${view.state} failure=${view.failure ?? "—"} recoveries=${view.recoveries?.length ?? 0}` +
        (view.state === "unconfigured" ? " — выполните `--reset-profile` или проверьте LOGINOM_DOCK_API_KEY" : ""),
      exitCode,
    )
  return { recovered: acknowledged, view }
}

export async function resetProfile(config: EvalConfig) {
  const busy = await profileProcesses(config.profileDir)
  if (busy.trim()) throw new EvalFailure(`Нельзя сбросить профиль: занят процессами\n${busy.trim()}`, 2)
  await rm(config.profileDir, { recursive: true, force: true })
}

// Вызывается после recovery и копирования артефактов; долговечные stores лежат вне attempts.
export async function pruneRuntimeAttempts(profileDir: string) {
  const { lstat, readdir } = await import("node:fs/promises")
  const entries = (directory: string) =>
    readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    })
  if ((await entries(path.join(profileDir, "loginom", "recovery"))).some((entry) => /\.(json|tmp)$/.test(entry.name)))
    throw new EvalFailure("Нельзя очистить runtime attempts: pending recovery", 2)
  if (await exists(path.join(profileDir, "loginom", "connection", "pending.json")))
    throw new EvalFailure("Нельзя очистить runtime attempts: pending connection", 2)
  await releaseStaleWriter(profileDir)
  const directoryInfo = (directory: string) =>
    lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
  const roots = await Promise.all([
    profileDir, path.join(profileDir, "loginom"), path.join(profileDir, "loginom", "runtime"),
  ].map(directoryInfo))
  if (roots.some((info) => !info?.isDirectory() || info.isSymbolicLink())) return 0
  const directories = async (directory: string) => {
    const info = await directoryInfo(directory)
    if (!info?.isDirectory() || info.isSymbolicLink()) return []
    return (await entries(directory))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(directory, entry.name))
  }
  const generations = await directories(path.join(profileDir, "loginom", "runtime", "generations"))
  const chats = (await Promise.all(generations.map((generation) => directories(path.join(generation, "chats"))))).flat()
  const attempts = (await Promise.all(chats.map(directories)))
    .flat()
    .filter((directory) => path.basename(directory) === "attempts")
  await Promise.all(attempts.map((directory) => rm(directory, { recursive: true, force: true })))
  return attempts.length
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
