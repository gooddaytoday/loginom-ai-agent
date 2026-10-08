import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"
import { readNodeEvents } from "../src/node-events"

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
    const mutations = [
      (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { const m = c.output.configuration.readback.output_mapping; if (m) [m.target_fields[2].source, m.target_fields[3].source] = [m.target_fields[3].source, m.target_fields[2].source] }) },
      (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "text_import").forEach(c => { c.output.configuration.readback.format.null_marker = "" }) },
      (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.input.target?.type === "imports.text").forEach(c => { c.input.parameters.settings.format.null_marker = "" }) },
      (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.tool.endsWith("artifact_deliver")).forEach(c => { c.output.output.sha256 = "0".repeat(64) }) },
      (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.output.ports[0].exact_table.rows[1][2].value = "1"; c.output.output.ports[0].exact_table.rows[1][2].native.bytes_le = "0100000000000000" }) },
      (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.input.action_key === "package.save_checkpoint").forEach(c => { c.output.output.save_completed = false }) },
    ]
    for (const mutate of mutations) {
      const events = readNodeEvents(protocol.map((e: unknown) => JSON.stringify(e)).join("\n")); mutate(events.calls)
      await Bun.write(path.join(root, "events.jsonl"), events.calls.map(c => JSON.stringify({ type: "tool_use", part: { id: String(c.index), tool: c.tool, state: { status: "completed", input: c.input, output: JSON.stringify(c.output), time: { start: c.start, end: c.end } } } })).join("\n"))
      expect((await validateNodeAttempt(root, root)).failures.length).toBeGreaterThan(0)
    }
    await reset()
    await rm(path.join(root, "native-crosstable.json"))
    expect((await validateNodeAttempt(root, root)).failures.join(" ")).toContain("native")
  } finally { await rm(root, { recursive: true, force: true }) }
})
