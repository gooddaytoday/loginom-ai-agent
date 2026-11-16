import { rm } from "node:fs/promises"

type Remove = (path: string, options: { recursive: true; force: true }) => Promise<void>

// A child that has already emitted exit can keep its copied executable image
// (node.exe, rg.exe) locked briefly on Windows. Only fixture removal waits for
// that release; the assertions of the tests that use it are unchanged.
export async function removeFixture(
  directory: string,
  { platform = process.platform, remove = rm as Remove, sleep = Bun.sleep, attempts = 50 } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await remove(directory, { recursive: true, force: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ""
      if (platform !== "win32" || !["EBUSY", "EPERM", "ENOTEMPTY"].includes(code) || attempt >= attempts) throw error
      await sleep(100)
    }
  }
}
