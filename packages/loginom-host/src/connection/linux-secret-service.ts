import { execFile } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { realpath } from "node:fs/promises"
import { isAbsolute } from "node:path"

export async function linuxSecretService(root: string, create: boolean) {
  if (process.platform !== "linux" || !isAbsolute(root) || !process.env.DBUS_SESSION_BUS_ADDRESS) throw unavailable()
  const canonical = await realpath(root).catch(() => {
    throw unavailable()
  })
  const profile = createHash("sha256").update(canonical).digest("hex")
  const attributes = ["application", "loginom-ai-agent", "desktop-profile", profile]
  const existing = await secretTool(["lookup", ...attributes])
  if (existing !== undefined) {
    const key = Buffer.from(existing, "base64")
    if (key.length !== 32 || key.toString("base64") !== existing) throw unavailable()
    return { profile, key }
  }
  if (!create) throw unavailable()
  const key = randomBytes(32)
  try {
    await secretTool(["store", "--collection=default", "--label=Loginom AI Agent Desktop", ...attributes], key)
    return { profile, key }
  } catch {
    key.fill(0)
    throw unavailable()
  }
}

function secretTool(args: string[], key?: Buffer) {
  return new Promise<string | undefined>((resolve, reject) => {
    const child = execFile("secret-tool", args, { timeout: 15000, maxBuffer: 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout)
      if (!key && error.code === 1 && !stderr && !stdout) return resolve(undefined)
      reject(unavailable())
    })
    child.stdin?.on("error", () => reject(unavailable()))
    child.stdin?.end(key?.toString("base64"))
  })
}

function unavailable() {
  return new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
}
