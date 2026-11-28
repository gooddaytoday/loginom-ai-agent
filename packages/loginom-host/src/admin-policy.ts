import { parseUpdateAdminPolicy } from "@loginom-ai-agent/product/update-policy"
import { readFile } from "node:fs/promises"
import { win32 } from "node:path"

export function policyPath(platform = process.platform, env = process.env) {
  if (platform === "win32") return win32.join(env.ProgramData ?? "C:\\ProgramData", "Loginom AI Agent", "policy.json")
  if (platform === "darwin") return "/Library/Application Support/Loginom AI Agent/policy.json"
  return "/etc/loginom-ai-agent/policy.json"
}

export async function policyStatus(file: string) {
  try {
    parseUpdateAdminPolicy(JSON.parse(await readFile(file, "utf8")))
    return "present"
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? "absent" : "invalid"
  }
}
