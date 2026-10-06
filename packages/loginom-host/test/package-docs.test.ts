import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
import { extractPackage } from "../src/package-docs/extract"

const fixtures = join(import.meta.dir, "fixtures/package-docs")

test("Node extraction matches the saved Python structure of a Cyrillic two-node package", async () => {
  const source = join(fixtures, "demo.lgp")
  const before = createHash("sha256").update(await readFile(source)).digest("hex")
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "structure.json")).json()
  expect(await extractPackage(source)).toEqual(expected)
  expect(createHash("sha256").update(await readFile(source)).digest("hex")).toBe(before)
})

test("the bundled extractor runs under the product-pinned Node without Bun or Python", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const output = await mkdtemp(join(tmpdir(), "loginom-docs-extract-node-"))
  try {
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, "../src/package-docs/extract.ts")],
      outdir: output,
      naming: "extract.mjs",
      target: "node",
      packages: "bundle",
      splitting: false,
    })
    expect(build.success).toBe(true)
    const child = Bun.spawn([node, "--input-type=module", "--eval",
      "const {extractPackage} = await import(process.argv[1]); console.log(JSON.stringify(await extractPackage(process.argv[2])))",
      pathToFileURL(join(output, "extract.mjs")).href, join(fixtures, "demo.lgp")],
      { env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
    const stdout = new Response(child.stdout).text()
    const stderr = new Response(child.stderr).text()
    expect(await child.exited).toBe(0)
    expect(await stderr).toBe("")
    expect(JSON.parse(await stdout)).toEqual(await Bun.file(join(fixtures, "structure.json")).json())
  } finally { await rm(output, { recursive: true, force: true }) }
}, 20_000)
