import { constants } from "node:fs"
import { open } from "node:fs/promises"

export async function tryCampaignLock(file: string): Promise<(() => Promise<void>) | undefined> {
  const { dlopen } = await import("bun:ffi")
  const library = dlopen("libc.so.6", { flock: { args: ["i32", "i32"], returns: "i32" } })
  const handle = await open(file, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)
    .catch(error => { library.close(); throw error })
  if (library.symbols.flock(handle.fd, 2 | 4) !== 0) { await handle.close(); library.close(); return }
  return async () => { await handle.close(); library.close() }
}
