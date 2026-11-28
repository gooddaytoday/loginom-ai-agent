import { Flock } from "@opencode/util/flock"
import { basename, dirname } from "node:path"

export function lockRegistration(file: string) {
  const name = process.platform === "win32" ? basename(file).toLowerCase() : basename(file)
  return Flock.acquire(`service-registration:${name}`, {
    dir: dirname(file),
    timeoutMs: 65_000,
    baseDelayMs: 10,
    maxDelayMs: 100,
  })
}
