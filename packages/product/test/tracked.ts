import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export function trackedSnapshot(root: string) {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 29 })
    .split("\0")
    .filter(Boolean)
  return { paths, read: (path: string) => readFileSync(join(root, path), "utf8") }
}
