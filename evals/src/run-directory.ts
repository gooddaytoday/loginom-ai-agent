import path from "node:path"
import { mkdir, mkdtemp } from "node:fs/promises"

export async function reserveRunDirectory(resultsDir: string, prefix: string) {
  await mkdir(resultsDir, { recursive: true })
  return mkdtemp(path.join(resultsDir, `${prefix}-`))
}
