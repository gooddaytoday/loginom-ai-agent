import { createHash } from "node:crypto"
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { tmpdir } from "node:os"
import { parsePublication } from "../contract/publication.ts"
import { buildSources, outputText } from "./build.ts"

export async function buildNext(input: { jobsIn: string; jobsOut: string; template: string; node: string; signal?: AbortSignal }) {
  const id = (await readdir(input.jobsIn)).find(name => /^[a-f0-9]{64}$/.test(name))
  if (!id) return
  const output = join(input.jobsOut, id)
  const work = await mkdtemp(join(tmpdir(), "dashboard-job-"))
  const bytes = await readFile(join(input.jobsIn, id, "publication.json"))
  const sourceHash = createHash("sha256").update(bytes).digest("hex")
  try {
    const publication = parsePublication(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    for (const file of publication.files) {
      await mkdir(dirname(join(work, file.path)), { recursive: true })
      await writeFile(join(work, file.path), Buffer.from(file.content, file.encoding === "utf8" ? "utf8" : "base64"))
    }
    const result = await buildSources({ work, template: input.template, node: input.node, out: join(work, "build"), signal: input.signal })
    if (result.ok) {
      const entries = await readdir(result.dir, { recursive: true, withFileTypes: true })
      if (entries.some(entry => !entry.isFile() && !entry.isDirectory())) throw Error("DASHBOARD_OUTPUT_FILE")
      const dist = join(output, "dist")
      // An interrupted attempt may have copied part of dist before publishing result.json.
      await rm(dist, { recursive: true, force: true })
      const directories = ["", ...entries.filter(entry => entry.isDirectory()).map(entry => relative(result.dir, join(entry.parentPath, entry.name)))].sort()
      for (const directory of directories) {
        // Never recreate a retired output root; every nonempty directory must already be removable by publisher's UID.
        await mkdir(join(dist, directory), { mode: 0o2770 })
        await chmod(join(dist, directory), 0o2770)
      }
      for (const file of entries.filter(entry => entry.isFile())) {
        await copyFile(join(file.parentPath, file.name), join(dist, relative(result.dir, join(file.parentPath, file.name))))
      }
    }
    await writeFile(join(output, "result.tmp"), JSON.stringify({ id, sourceHash, outcome: result.ok ? "ready" : "failed", output: result.output }))
  } catch (error) {
    await writeFile(join(output, "result.tmp"), JSON.stringify({ id, sourceHash, outcome: "failed", output: outputText(Buffer.from(String(error))) }))
  } finally {
    await rm(work, { recursive: true, force: true })
  }
  await rename(join(output, "result.tmp"), join(output, "result.json"))
}
