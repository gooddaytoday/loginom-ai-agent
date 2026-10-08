import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"
import { readNodeEvents } from "../src/node-events"

test("bindings: observed local IDs, owned selected proxies and persisted references are mandatory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-bindings-"))
  try {
    const csv = "Region,A_Amount_Sum,A_Amount_Count\nN,15,2\nS,3,1\n"
    await Bun.write(path.join(root, "task.json"), JSON.stringify({ id: "crosstable-local-variable-bindings", checklist: ["input", "crosstable", "graph", "sequence", "export", "result"].map(id => ({ id, required: true })) }))
    await Bun.write(path.join(root, "data/sales.csv"), "Region,Category,Amount\nN,A,10\nN,A,5\nN,B,7\nS,A,3\nS,B,2\n")
    await Bun.write(path.join(root, "oracle.csv"), csv)
    await Bun.write(path.join(root, "artifact/results/eval-reference-crosstable-local-variable-bindings-1-crosstable-local-variable-bindings-1.result.csv"), csv)
    const originalXml = await Bun.file(new URL("fixtures/node-evals/bindings.xml", import.meta.url)).text()
    const protocol = await Bun.file(new URL("fixtures/node-evals/bindings-protocol.json", import.meta.url)).json()
    const originalNative = await Bun.file(new URL("fixtures/node-evals/bindings-native.json", import.meta.url)).json()
    async function save(xml = originalXml, native = originalNative, calls = readNodeEvents(protocol.map((e: unknown) => JSON.stringify(e)).join("\n")).calls) {
      await Bun.write(path.join(root, "artifact/unpacked/Unit_0/Unit.xml"), xml)
      const child = Bun.spawn(["python3", "-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()", path.join(root, "artifact/package.lgp"), path.join(root, "artifact/unpacked/Unit_0/Unit.xml")])
      expect(await child.exited).toBe(0)
      await Bun.write(path.join(root, "native-crosstable.json"), JSON.stringify(native))
      await Bun.write(path.join(root, "events.jsonl"), calls.map(c => JSON.stringify({ type: "tool_use", part: { id: String(c.index), tool: c.tool, state: { status: "completed", input: c.input, output: JSON.stringify(c.output), time: { start: c.start, end: c.end } } } })).join("\n"))
    }
    await save()
    expect(await validateNodeAttempt(root, root)).toEqual({ errors: [], failures: [] })
    const nativeMutations = [
      (n: typeof originalNative) => { n.local_variable_observations = [] },
      (n: typeof originalNative) => { n.local_variable_observations[0].output.node_context.node_id = "foreign" },
      (n: typeof originalNative) => { n.local_variable_observations[0].output.variables[0].id = 9 },
      (n: typeof originalNative) => { n.local_variable_observations[0].output.variables[0].name = "Other" },
      (n: typeof originalNative) => { n.local_variable_observations[0].output.variables[0].type = 5 },
      (n: typeof originalNative) => { n.local_variable_observations[0].output.variables[0].value = 2 },
      (n: typeof originalNative) => { n.local_variable_observations[0].source_sha256 = "" },
      ...["pedSlidingUniqueValuesLimit", "pedUniqueValueNames", "pedDisplayNameSeparator"].flatMap(key => [
        (n: typeof originalNative) => { n.observations[0].node_crosstable.options[key].variable = null },
        (n: typeof originalNative) => { n.observations[0].node_crosstable.options[key].variable.selected_proxy_equal = false },
        (n: typeof originalNative) => { n.observations[0].node_crosstable.options[key].switch_pressed = false },
      ]),
    ]
    for (const mutate of nativeMutations) {
      const n = structuredClone(originalNative); mutate(n); await save(originalXml, n)
      expect((await validateNodeAttempt(root, root)).failures.length).toBeGreaterThan(0)
    }
    const xmlMutations = [
      (x: string) => x.replace(/<PropBinder>[\s\S]*?<\/PropBinder>/, ""),
      ...["GroupLimit", "CategoryNames", "CaptionSeparator"].map(name => (x: string) => x.replace(new RegExp(`<Item Name="[^"]+" PropertyPath="[^"]+" VariableName="${name}"\\s*/>`), "")),
      (x: string) => x.replace('VariableName="GroupLimit"', 'VariableName="Foreign"'),
      (x: string) => x.replace('Name="GroupLimit" DataType="dtInteger" OriginType="iotCustom"', 'Name="GroupLimit" DataType="dtInteger" OriginType="iotInput"'),
      (x: string) => x.replace('Name="GroupLimit" DataType="dtInteger"', 'Name="GroupLimit" DataType="dtFloat"'),
      (x: string) => x.replace('TBGIntegerVariableContainer" Value="1"', 'TBGIntegerVariableContainer" Value="2"'),
      (x: string) => x.replace('TBGStringVariableContainer" Value="."', 'TBGStringVariableContainer" Value="|"'),
      (x: string) => x.replace('UniqueValueNames="true"', 'UniqueValueNames="false"'),
    ]
    for (const [index, mutate] of xmlMutations.entries()) {
      const changed = mutate(originalXml)
      expect(changed !== originalXml, `XML mutation ${index} changes evidence`).toBe(true)
      await save(changed)
      expect((await validateNodeAttempt(root, root)).failures.length, `XML mutation ${index} rejected`).toBeGreaterThan(0)
    }
    const callMutations = [
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { delete c.output.configuration.readback.options.variable_bindings.limit },
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { c.output.configuration.readback.options.variable_bindings.limit.id = 7 },
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { c.output.output.ports[0].schema[1].label = "A|Amount|Сумма" },
      (c: ReturnType<typeof readNodeEvents>["calls"][number]) => { c.output.configuration.readback.output_mapping = { verified: true } },
    ]
    for (const mutate of callMutations) {
      const calls = readNodeEvents(protocol.map((e: unknown) => JSON.stringify(e)).join("\n")).calls
      calls.filter(c => c.output.configuration?.readback?.kind === "crosstable").forEach(mutate)
      await save(originalXml, originalNative, calls)
      expect((await validateNodeAttempt(root, root)).failures.length).toBeGreaterThan(0)
    }
    await save()
    expect(await validateNodeAttempt(root, root)).toEqual({ errors: [], failures: [] })
  } finally { await rm(root, { recursive: true, force: true }) }
})
