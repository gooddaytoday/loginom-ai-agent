import { readFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import type { RuntimeHandle } from "./connection-service"

export function connectionSwitchFixture(root: string) {
  return async (prepare: () => Promise<RuntimeHandle>, signal: AbortSignal): Promise<RuntimeHandle> => {
    const file = join(root, "con08-fault")
    const fault = await readFile(file, "utf8")
      .then((value) => value.trim())
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
    if (fault === undefined) return prepare()
    await unlink(file)
    if (fault === "start") throw Error("LOGINOM_RUNTIME_START_FAILED")
    const handle = await prepare()
    if (fault === "before-activate")
      return {
        ...handle,
        beforeActivate() {
          throw Error("LOGINOM_STORE_WRITE_FAILED")
        },
      }
    if (fault === "readiness-timeout")
      return {
        ...handle,
        // Simulate a missing readiness response with a short deadline for the gate.
        ready: setTimeout(1000, undefined, { signal }).then(() => {
          throw Error("LOGINOM_RUNTIME_TIMEOUT")
        }),
      }
    return handle
  }
}
