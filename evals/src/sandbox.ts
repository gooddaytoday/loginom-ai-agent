import path from "node:path"
import { realpath, readFile } from "node:fs/promises"
import { repoRoot } from "./config"
import { EvalFailure } from "./fail"

const inside = (file: string, root: string) => file === root || file.startsWith(root + path.sep)

export class SandboxFailure extends EvalFailure {
  constructor(message: string) { super(`Изоляция eval: ${message}; неизолированный запуск запрещён`, 2) }
}

/** A fixed Linux filesystem boundary for the installed eval CLI, not a tool permission policy. */
export async function sandboxCommand(input: {
  cmd: string[]; profileDir: string; workdir: string; env: Record<string, string | undefined>
}) {
  if (process.platform !== "linux" || !Bun.which("bwrap"))
    throw new EvalFailure("Изоляция eval требует Linux и bubblewrap; неизолированный запуск запрещён", 2)
  const binary = await realpath(Bun.which(input.cmd[0]!) ?? input.cmd[0]!)
  const installation = path.dirname(path.dirname(binary))
  const profile = await realpath(input.profileDir)
  const workspace = await realpath(input.workdir)
  if (inside(repoRoot, installation) || !await Bun.file(path.join(installation, "cli-manifest.json")).exists())
    throw new EvalFailure("Изоляция eval требует установленный CLI с cli-manifest.json вне checkout", 2)
  if ([profile, workspace].some((root) => inside(repoRoot, root) || inside(installation, root)) ||
    inside(profile, workspace) || inside(workspace, profile) || inside(profile, installation) || inside(workspace, installation))
    throw new EvalFailure("Профиль и workspace изоляции должны быть отдельными узкими каталогами", 2)
  const cmd = [Bun.which("bwrap")!, "--unshare-user", "--unshare-pid", "--unshare-ipc", "--die-with-parent", "--new-session",
    "--json-status-fd", "3", "--ro-bind", "/usr", "/usr",
    "--symlink", "usr/bin", "/bin", "--symlink", "usr/sbin", "/sbin",
    "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64",
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/dev/shm", "--tmpfs", "/tmp", "--dir", "/home/eval",
    "--ro-bind", installation, installation, "--bind", profile, profile, "--bind", workspace, workspace, "--chdir", workspace]
  for (const file of ["/etc/ld.so.cache", "/etc/nsswitch.conf", "/etc/resolv.conf", "/etc/hosts", "/etc/passwd", "/etc/group", "/etc/fonts", "/etc/ssl/certs"])
    cmd.push("--ro-bind", await realpath(file), file)
  cmd.push("--", binary, ...input.cmd.slice(1))
  const inherited = Object.fromEntries(Object.entries(input.env).flatMap(([name, value]) =>
    value !== undefined && /^(?:https?_proxy|all_proxy|no_proxy|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|LOGINOM_AI_AGENT_(?:CLI_PROFILE|PURE|DISABLE_PROJECT_CONFIG|DISABLE_CLAUDE_CODE_PROMPT))$/.test(name)
      ? [[name, value]] : []))
  return { cmd, cwd: workspace, env: { ...inherited, PATH: "/usr/bin:/bin", HOME: "/home/eval", LANG: "C.UTF-8", TMPDIR: "/tmp" } }
}

/** Inspect actual listeners, including debugger ports allocated with =0. No debugger code is executed. */
export async function debuggerEndpoints() {
  const endpoints = (await Promise.all(["tcp", "tcp6"].map(async (table) => {
    const lines = (await readFile(`/proc/net/${table}`, "utf8")).trim().split("\n").slice(1)
    return lines.flatMap((line) => {
      const fields = line.trim().split(/\s+/)
      if (fields.length < 10) throw new SandboxFailure("не удалось прочитать listening-порты")
      if (fields[3] !== "0A") return []
      const [hex, port] = fields[1]!.split(":")
      const bytes = Buffer.from(hex!, "hex")
      for (let index = 0; index < bytes.length; index += 4) bytes.subarray(index, index + 4).reverse()
      const address = table === "tcp"
        ? bytes.every((byte) => byte === 0) ? "127.0.0.1" : [...bytes].join(".")
        : bytes.every((byte) => byte === 0) ? "[::1]" : `[${Array.from({ length: 8 }, (_, index) => bytes.readUInt16BE(index * 2).toString(16)).join(":")}]`
      return [`http://${address}:${parseInt(port!, 16)}`]
    })
  }))).flat()
  return (await Promise.all([...new Set(endpoints)].map(async (endpoint) => {
    const version = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_000) })
      .then((response) => response.json()).catch(() => undefined) as Record<string, unknown> | undefined
    return version && typeof version.Browser === "string" && typeof version["Protocol-Version"] === "string" ? endpoint : undefined
  }))).filter((endpoint) => endpoint !== undefined)
}

export async function assertNoDebuggers() {
  const endpoints = await debuggerEndpoints().catch(() => { throw new SandboxFailure("проверка внешних отладчиков не выполнена") })
  if (endpoints.length) throw new SandboxFailure(`выключите внешние inspector/CDP перед eval: ${endpoints.join(", ")}`)
}
