import { expect, test } from "bun:test"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { unzip } from "../src/artifact"
import { readNodeXml } from "../src/node-xml"
import { inspectSelectionGraph } from "../src/node-selection-graph"

test("all six native reference graphs are complete, including the first-last-touch side branch", async () => {
  for (const id of ["sales-by-category", "abc-pareto-groups", "monthly-demand", "risky-approved-claims",
    "campaign-roi-by-channel", "first-last-touch"]) {
    expect(inspectSelectionGraph(await reference(id), "standard")).toEqual({ complete: true, failures: [] })
  }
})

async function reference(id: string) {
  const root = await mkdtemp(path.join(tmpdir(), "selection-graph-"))
  try {
    await cp(path.resolve(import.meta.dir, `../tasks/analytic/${id}/reference.lgp`), path.join(root, "package.lgp"))
    if (!await unzip(path.join(root, "package.lgp"), path.join(root, "unpacked"))) throw Error("REFERENCE_XML_INVALID")
    const xml = await readNodeXml(root)
    if ("invalid" in xml) throw Error("REFERENCE_XML_INVALID")
    return xml
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
