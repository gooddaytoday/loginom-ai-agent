import { readFile } from "node:fs/promises"
import { win32 } from "node:path"

export function policyPath(platform = process.platform, env = process.env) {
  if (platform === "win32") return win32.join(env.ProgramData ?? "C:\\ProgramData", "Loginom AI Agent", "policy.json")
  if (platform === "darwin") return "/Library/Application Support/Loginom AI Agent/policy.json"
  return "/etc/loginom-ai-agent/policy.json"
}

export async function policyStatus(file: string) {
  try {
    const policy: unknown = JSON.parse(await readFile(file, "utf8"))
    if (typeof policy !== "object" || policy === null || Array.isArray(policy)) return "invalid"
    if ("channel" in policy && policy.channel !== "stable" && policy.channel !== "unstable") return "invalid"
    if ("network" in policy && policy.network !== "online" && policy.network !== "device") return "invalid"
    return "present"
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? "absent" : "invalid"
  }
}
