import path from "node:path"
import { readdir, realpath } from "node:fs/promises"
import cases from "./text-import-cases.json"

export const textImportIds = cases.groups.flatMap(group => group.ids)
export const textImportChecks = ["input", "import", "graph", "sequence", "result", "diagnostic"]

/** Preserve raw native events, including refusals. Requested settings are never observations. */
export async function collectTextImportEvidence(attemptDir: string, profileDir: string) {
  const cleanup = await Bun.file(path.join(attemptDir, "cleanup.json")).json() as {
    result?: { status?: string }; stages?: { stage: string; status: string; path?: string }[]
  }
  const archive = cleanup.stages?.find(stage => stage.stage === "profile_history" && stage.status === "confirmed")?.path
  if (cleanup.result?.status !== "confirmed" || !archive ||
    !archive.startsWith(path.resolve(profileDir) + ".history" + path.sep) || await realpath(archive) !== archive)
    throw Error("text import evidence requires own confirmed history archive")
  const files: { source: string; sha256: string; events: unknown[] }[] = []
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== "browser-profile") await visit(file)
        continue
      }
      if (!entry.isFile() || entry.name !== "execution-events.jsonl") continue
      const raw = await Bun.file(file).bytes()
      files.push({ source: path.relative(archive!, file),
        sha256: new Bun.CryptoHasher("sha256").update(raw).digest("hex"),
        events: new TextDecoder().decode(raw).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line) as unknown) })
    }
  }
  await visit(archive)
  await Bun.write(path.join(attemptDir, "native-import.json"), JSON.stringify({ version: 1, archive, files }, null, 2) + "\n")
}
