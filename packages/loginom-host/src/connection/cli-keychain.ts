import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { realpath } from "node:fs/promises"
import { isAbsolute, join } from "node:path"

export async function cliKeychain(root: string, resources: string, create: boolean) {
  if (process.platform !== "darwin" || !isAbsolute(root) || !isAbsolute(resources))
    throw Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
  const canonical = await realpath(root).catch(() => {
    throw Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
  })
  const profile = createHash("sha256").update(canonical).digest("hex")
  const key = await new Promise<Buffer>((resolve, reject) => {
    const child = execFile(
      join(resources, "bin/loginom-keychain"),
      [],
      {
        env: {},
        timeout: 15000,
        maxBuffer: 1024,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error || !/^[A-Za-z0-9+/]{43}=$/.test(stdout)) {
          reject(Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE"))
          return
        }
        const bytes = Buffer.from(stdout, "base64")
        if (bytes.length !== 32 || bytes.toString("base64") !== stdout) {
          reject(Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE"))
          return
        }
        resolve(bytes)
      },
    )
    child.stdin?.on("error", () => reject(Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")))
    child.stdin?.end(`${create ? "create" : "read"} ${profile}`)
  })
  return { profile, key }
}
