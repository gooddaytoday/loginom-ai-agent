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

test("nested workflows match the frozen Python structure, identities and statistics", async () => {
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "nested.structure.json")).json()
  expect(await extractPackage(join(fixtures, "nested.lgp"))).toEqual(expected)
})

test("ZIP member case and backslash names preserve the Python structure", async () => {
  const expected: Awaited<ReturnType<typeof extractPackage>> = await Bun.file(join(fixtures, "aliases.structure.json")).json()
  expect(await extractPackage(join(fixtures, "aliases.lgp"))).toEqual(expected)
})

test("statistics and graph include descendants beyond the former two-level limit", async () => {
  const structure = await extractPackage(join(fixtures, "deep.lgp"))
  expect(structure.stats).toEqual({ modules: 1, notes: 0, nodes: 8, submodels: 3,
    programming_nodes: 2, reference_nodes: 1, derived_nodes: 1 })
  expect(structure.modules[0].stats.nesting_depth).toBe(4)
  const node = structure.modules[0].submodels[0].submodels[0].submodels[0].workflow_nodes[0]
  expect(node.engine_type).toBe("TBGJavaScript")
  expect(node.path).toBe("Unit_0/Вложенная модель/Ещё глубже/Третий уровень")
})

test("an indexed module without Unit.xml fails instead of producing an empty report", async () => {
  await expect(extractPackage(join(fixtures, "missing-unit.lgp"))).rejects.toThrow("PACKAGE_DOCS_UNIT_MISSING")
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
    for (const name of ["demo", "nested", "aliases"]) {
      const child = Bun.spawn([node, "--input-type=module", "--eval",
        "const {extractPackage} = await import(process.argv[1]); console.log(JSON.stringify(await extractPackage(process.argv[2])))",
        pathToFileURL(join(output, "extract.mjs")).href, join(fixtures, name + ".lgp")],
        { env: { LANG: "C.UTF-8" }, stdout: "pipe", stderr: "pipe" })
      const stdout = new Response(child.stdout).text()
      const stderr = new Response(child.stderr).text()
      expect(await child.exited).toBe(0)
      expect(await stderr).toBe("")
      expect(JSON.parse(await stdout)).toEqual(await Bun.file(join(fixtures, name === "demo" ? "structure.json" : name + ".structure.json")).json())
    }
  } finally { await rm(output, { recursive: true, force: true }) }
}, 20_000)
