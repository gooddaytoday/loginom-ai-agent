import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"

test("string counts: actual native reference and required input/mask/mapping negatives", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-string-counts-"))
  try {
    await Bun.write(path.join(root, "task.json"), JSON.stringify({ id: "crosstable-string-counts-null", checklist: ["input", "crosstable", "graph", "sequence", "export", "result"].map(id => ({ id, required: true })) }))
    const source = "Region,Category,Text\nN,A,x\nN,A,x\nN,A,?\nN,B,y\nS,A,?\nS,B,z\nS,B,w\n"
    const csv = "Region,A_count,A_unique,A_null,B_count,B_unique,B_null\nN,3,1,1,1,1,0\nS,1,0,1,2,2,0\n"
    await Bun.write(path.join(root, "data/sales.csv"), source); await Bun.write(path.join(root, "oracle.csv"), csv)
    await Bun.write(path.join(root, "artifact/results/eval-reference-crosstable-string-counts-null-1-crosstable-string-counts-null-1.result.csv"), csv)
    const xml = await Bun.file(new URL("fixtures/node-evals/string-counts.xml", import.meta.url)).text()
    await Bun.write(path.join(root, "artifact/unpacked/Unit_0/Unit.xml"), xml)
    const child = Bun.spawn(["python3", "-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()", path.join(root, "artifact/package.lgp"), path.join(root, "artifact/unpacked/Unit_0/Unit.xml")])
    expect(await child.exited).toBe(0)
    const protocol = await Bun.file(new URL("fixtures/node-evals/string-counts-protocol.json", import.meta.url)).json()
    const native = await Bun.file(new URL("fixtures/node-evals/string-counts-native.json", import.meta.url)).json()
    async function reset() {
      await Bun.write(path.join(root, "events.jsonl"), protocol.map((e: unknown) => JSON.stringify(e)).join("\n"))
      await Bun.write(path.join(root, "native-crosstable.json"), JSON.stringify(native))
    }
    await reset()
    expect(await validateNodeAttempt(root, root)).toEqual({ errors: [], failures: [] })
    for (const mask of [2, 128, 256, 387]) {
      const changed = structuredClone(native)
      for (const o of changed.observations) o.node_crosstable.input_fields.find((f: { label: string }) => f.label === "Text").functions = mask
      await Bun.write(path.join(root, "native-crosstable.json"), JSON.stringify(changed))
      expect((await validateNodeAttempt(root, root)).failures.join(" ")).toContain("native")
    }
    await reset()
    await Bun.write(path.join(root, "data/sales.csv"), source.replace("N,A,?", "N,A,x"))
    expect((await validateNodeAttempt(root, root)).failures.join(" ")).toContain("input")
    await Bun.write(path.join(root, "data/sales.csv"), source)
    await rm(path.join(root, "native-crosstable.json"))
    expect((await validateNodeAttempt(root, root)).failures.join(" ")).toContain("native")
  } finally { await rm(root, { recursive: true, force: true }) }
})
