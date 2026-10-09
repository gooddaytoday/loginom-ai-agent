import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"
import { readNodeEvents } from "../src/node-events"

for (const prefix of ["string-counts", "cartesian", "multi-facts", "bindings"]) {
  test(`${prefix}: real reference rejects missing creation/read/artifact, wrong input/roles/types/identity`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "coverage-negatives-"))
    try {
      const fixture = await Bun.file(new URL(`fixtures/node-evals/${prefix}-case.json`, import.meta.url)).json()
      const original = await Bun.file(new URL(`fixtures/node-evals/${prefix}-protocol.json`, import.meta.url)).json()
      const native = await Bun.file(new URL(`fixtures/node-evals/${prefix}-native.json`, import.meta.url)).json()
      const xml = await Bun.file(new URL(`fixtures/node-evals/${prefix}.xml`, import.meta.url)).text()
      await Bun.write(path.join(root, "task.json"), JSON.stringify({ id: fixture.id, checklist: ["input", "crosstable", "graph", "sequence", "export", "result"].map(id => ({ id, required: true })) }))
      await Bun.write(path.join(root, "oracle.csv"), fixture.oracle)
      await Bun.write(path.join(root, "artifact/results", fixture.result_basename), fixture.oracle)
      async function reset() {
        await Bun.write(path.join(root, "data/sales.csv"), fixture.input)
        await Bun.write(path.join(root, "native-crosstable.json"), JSON.stringify(native))
        await Bun.write(path.join(root, "artifact/unpacked/Unit_0/Unit.xml"), xml)
        const zip = Bun.spawn(["python3", "-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()", path.join(root, "artifact/package.lgp"), path.join(root, "artifact/unpacked/Unit_0/Unit.xml")])
        expect(await zip.exited).toBe(0)
        await Bun.write(path.join(root, "events.jsonl"), original.map((e: unknown) => JSON.stringify(e)).join("\n"))
      }
      await reset()
      expect(await validateNodeAttempt(root, root)).toEqual({ errors: [], failures: [] })
      const mutations = [
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.input.target?.type === "transform.cross_table").forEach(c => { c.input.target.kind = "existing"; c.input.target.ref = { node_id: "other" } }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.node.node_id = "other"; c.output.configuration.readback.node.node_id = "other" }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.configuration.readback.category_mode = c.output.configuration.readback.category_mode === "fixed" ? "sliding" : "fixed" }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { delete c.output.output.ports[0].exact_table }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.output.ports[0].read_coverage.table_complete = false }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.output.ports[0].schema[1].type = "string" }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "text_import").forEach(c => { c.output.configuration.readback.columns.at(-1).type = "real" === c.output.configuration.readback.columns.at(-1).type ? "string" : "real" }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.configuration.readback.facts.at(-1).functions = ["avg"] }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.input.target?.type === "transform.cross_table" && c.input.parameters?.facts).forEach(c => { c.input.parameters.facts.at(-1).field.name = "Region" }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.output.ports[0].category_fields[0].fact = "other" }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.configuration.readback.facts.pop() }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.output.ports[0].schema.pop(); c.output.output.ports[0].category_fields.pop() }) },
        (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(c => { c.output.output.ports[0].category_fields[0].function = "other" }) },
        ...(prefix === "bindings" ? [] : [
          (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.output_mapping?.target_fields?.length > 1).forEach(c => { c.output.configuration.readback.output_mapping.target_fields[1].source.record_id = 999 }) },
          (calls: ReturnType<typeof readNodeEvents>["calls"]) => { calls.filter(c => c.output.configuration?.readback?.output_mapping?.target_fields?.length > 1).forEach(c => { c.output.configuration.readback.output_mapping.target_fields[1].source.label = "C_1" }) },
        ]),
      ]
      for (const [index, mutate] of mutations.entries()) {
        await reset()
        const calls = readNodeEvents(original.map((e: unknown) => JSON.stringify(e)).join("\n")).calls
        mutate(calls)
        await Bun.write(path.join(root, "events.jsonl"), calls.map(c => JSON.stringify({ type: "tool_use", part: { id: String(c.index), tool: c.tool, state: { status: "completed", input: c.input, output: JSON.stringify(c.output), time: { start: c.start, end: c.end } } } })).join("\n"))
        expect((await validateNodeAttempt(root, root)).failures.length, `protocol mutation ${index} rejected`).toBeGreaterThan(0)
      }
      await reset()
      await Bun.write(path.join(root, "data/sales.csv"), fixture.input.replace(/N,A,[^\n]+/, "N,A,999"))
      expect((await validateNodeAttempt(root, root)).failures.length).toBeGreaterThan(0)
      await reset()
      await rm(path.join(root, "native-crosstable.json"))
      expect((await validateNodeAttempt(root, root)).failures.length).toBeGreaterThan(0)
      await reset()
      await rm(path.join(root, "artifact/package.lgp"))
      expect((await validateNodeAttempt(root, root)).failures).toContain("missing artifact/package.lgp")
    } finally { await rm(root, { recursive: true, force: true }) }
  })
}
