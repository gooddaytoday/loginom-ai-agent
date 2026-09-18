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
  const busy = await profileProcesses(profileDir)
  if (busy.trim()) throw new EvalFailure(`Профиль ${profileDir} занят процессами:\n${busy.trim()}`, 2)
  await rm(writer, { recursive: true, force: true })
  return true
}

export async function waitProfileIdle(profileDir: string, timeoutMs = 60_000) {
  await terminateProfileProcesses(profileDir)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await profileProcesses(profileDir)).trim()) return true
    await Bun.sleep(2_000)
  }
  return false
}

// Matching is by argv substring; CLI children that receive the profile only via env are invisible to this check (known limitation).
async function profileProcesses(profileDir: string) {
  const pattern = `${profileDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)`
  return (await Bun.$`pgrep -u ${process.getuid?.() ?? ""} -f -- ${pattern}`.quiet().nothrow()).text()
}

async function terminateProfileProcesses(profileDir: string) {
  const pattern = `${profileDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)`
  await Bun.$`pkill -TERM -u ${process.getuid?.() ?? ""} -f -- ${pattern}`.quiet().nothrow()
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
      `Профиль Loginom не готов: state=${view.state} failure=${view.failure ?? "—"} recoveries=${view.recoveries?.length ?? 0}`,
      exitCode,
    )
  return { recovered: acknowledged, view }
}

export async function resetProfile(config: EvalConfig) {
  const busy = await profileProcesses(config.profileDir)
  if (busy.trim()) throw new EvalFailure(`Нельзя сбросить профиль: занят процессами\n${busy.trim()}`, 2)
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
