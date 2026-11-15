import { createHash } from "node:crypto"
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
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
      await cp(result.dir, join(output, "dist"), { recursive: true })
      // Publisher can remove accepted output even when its UID differs and capabilities are dropped.
      await chmod(join(output, "dist"), 0o777)
      for (const dir of await readdir(join(output, "dist"), { recursive: true, withFileTypes: true })) {
        if (dir.isDirectory()) await chmod(join(dir.parentPath, dir.name), 0o777)
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
