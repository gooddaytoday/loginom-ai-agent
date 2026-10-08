import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"
import { readNodeEvents } from "../src/node-events"

test("cartesian observed reference rejects dimension, empty intersection, source and native proof damage", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-cartesian-"))
  try {
    await Bun.write(path.join(root, "task.json"), JSON.stringify({ id: "crosstable-column-cartesian", checklist: ["input", "crosstable", "graph", "sequence", "export", "result"].map(id => ({ id, required: true })) }))
    await Bun.write(path.join(root, "data/sales.csv"), "Region,Category,Channel,Amount\nN,A,web,10\nN,A,web,5\nN,B,shop,7\nS,A,web,3\nS,B,shop,2\n")
    const csv = "Region,A_web,A_shop,B_web,B_shop\nN,15,,,7\nS,3,,,2\n"
    await Bun.write(path.join(root, "oracle.csv"), csv)
    await Bun.write(path.join(root, "artifact/results/eval-reference-crosstable-column-cartesian-1-crosstable-column-cartesian-1.result.csv"), csv)
    await Bun.write(path.join(root, "artifact/unpacked/Unit_0/Unit.xml"), await Bun.file(new URL("fixtures/node-evals/cartesian.xml", import.meta.url)).text())
    const child = Bun.spawn(["python3", "-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()", path.join(root, "artifact/package.lgp"), path.join(root, "artifact/unpacked/Unit_0/Unit.xml")])
    expect(await child.exited).toBe(0)
    const protocol = await Bun.file(new URL("fixtures/node-evals/cartesian-protocol.json", import.meta.url)).json()
    const native = await Bun.file(new URL("fixtures/node-evals/cartesian-native.json", import.meta.url)).json()
    await Bun.write(path.join(root, "native-crosstable.json"), JSON.stringify(native))
    await Bun.write(path.join(root, "events.jsonl"), protocol.map((e: unknown) => JSON.stringify(e)).join("\n"))
    expect(await validateNodeAttempt(root, root)).toEqual({ errors: [], failures: [] })
    const mutations = [
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { c.output.configuration.readback.columns.reverse() },
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { c.output.output.ports[0].category_fields[0].categories.reverse() },
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { c.output.output.ports[0].category_fields[0].categories[1].dimension = "Category" },
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { const p = c.output.output.ports[0]; p.exact_table.rows[0][2] = { type: "real", is_null: false, value: "0", precision: "exact_native", native: { tag: 5, encoding: "ieee754-binary64-le", bits: 64, bytes_le: "0000000000000000" } } },
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { const p = c.output.output.ports[0]; p.exact_table.rows[0][2].native.tag = 5 },
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { const m = c.output.configuration.readback.output_mapping; if (m) [m.target_fields[1].source, m.target_fields[4].source] = [m.target_fields[4].source, m.target_fields[1].source] },
    ]
    for (const mutate of mutations) {
      const events = readNodeEvents(protocol.map((e: unknown) => JSON.stringify(e)).join("\n"))
      events.calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(mutate)
      await Bun.write(path.join(root, "events.jsonl"), events.calls.map(c => JSON.stringify({ type: "tool_use", part: { id: String(c.index), tool: c.tool, state: { status: "completed", input: c.input, output: JSON.stringify(c.output), time: { start: c.start, end: c.end } } } })).join("\n"))
      expect((await validateNodeAttempt(root, root)).failures.length).toBeGreaterThan(0)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
