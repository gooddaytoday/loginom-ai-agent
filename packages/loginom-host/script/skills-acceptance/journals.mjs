import { lstat, mkdir, open, readdir, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { join, relative } from "node:path"
import { createHash } from "node:crypto"

// Test evidence only. The caller supplies its own private acceptance profile.
export async function collectExecutionJournals(profile, evidence, secrets = []) {
  const root = await lstat(profile).catch((error) => {
    if (error.code === "ENOENT") return null
    throw error
  })
  if (root && (!root.isDirectory() || root.isSymbolicLink())) throw Error("SKILLS_JOURNAL_PROFILE_INVALID")
  const files = await scan(profile)
  const receipts = await Promise.all(files.map(async (file) => {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    const bytes = await handle.readFile().finally(() => handle.close())
    if (secrets.filter(Boolean).some((secret) => bytes.toString("utf8").includes(secret)))
      throw Error("SKILLS_JOURNAL_SECRET")
    const source = relative(profile, file)
    const name = createHash("sha256").update(source).digest("hex") + ".jsonl"
    await mkdir(join(evidence, "internal-journals"), { recursive: true, mode: 0o700 })
    await writeFile(join(evidence, "internal-journals", name), bytes, { flag: "wx", mode: 0o600 })
    return { source, name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
  }))
  await mkdir(evidence, { recursive: true, mode: 0o700 })
  await writeFile(join(evidence, "internal-journals.json"), JSON.stringify(receipts, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  return receipts
}

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const found = await Promise.all(entries.map(async (entry) => {
    if (entry.name === "browser-profile") return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return scan(path)
    if (entry.name === "execution-events.jsonl" && entry.isSymbolicLink()) throw Error("SKILLS_JOURNAL_SYMLINK")
    return entry.name === "execution-events.jsonl" ? [path] : []
  }))
  return found.flat()
}
