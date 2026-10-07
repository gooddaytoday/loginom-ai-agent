import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"

test("положительное native доказательство и negative input/hash/save checks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-evidence-"))
  try {
    const input = "Region,Category,Amount\nN,A,10\nN,A,5\nN,B,7\nS,A,3\nS,B,2\n"
    await Bun.write(path.join(root, "data/sales.csv"), input)
    await Bun.write(path.join(root, "oracle.csv"), "Region,A,B\nN,15,7\nS,3,2\n")
    await Bun.write(path.join(root, "artifact/results/node-evals-crosstable-fixed-sum-3.result.csv"), "Region,A,B\nN,15,7\nS,3,2\n")
    await Bun.write(path.join(root, "task.json"), JSON.stringify({ id: "crosstable-fixed-sum",
      checklist: ["input", "crosstable", "graph", "export", "result"].map(id => ({ id, required: true })) }))
    const xml = await Bun.file(new URL("fixtures/node-evals/fixed-sum.xml", import.meta.url)).text()
    await Bun.write(path.join(root, "artifact/unpacked/Unit_0/Unit.xml"), xml)
    const child = Bun.spawn(["python3", "-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()",
      path.join(root, "artifact/package.lgp"), path.join(root, "artifact/unpacked/Unit_0/Unit.xml")])
    expect(await child.exited).toBe(0)
    const events = await Bun.file(new URL("fixtures/node-evals/fixed-sum-protocol.json", import.meta.url)).json()
    async function check(parts = events) {
      await Bun.write(path.join(root, "events.jsonl"), parts.map((e: unknown) => JSON.stringify(e)).join("\n"))
      return validateNodeAttempt(root, root, "/user/node-evals-crosstable-fixed-sum-3.lgp")
    }
    expect(await check()).toEqual({ errors: [], failures: [] })
    await Bun.write(path.join(root, "data/sales.csv"), input.replace("N,A,10", "N,A,11"))
    expect((await check()).failures.join(" ")).toContain("input")
    await Bun.write(path.join(root, "data/sales.csv"), input)
    const corrupted = structuredClone(events)
    const exported = corrupted.findLast((e: any) => e.part.tool.endsWith("node_wait"))
    const receipt = JSON.parse(exported.part.state.output); receipt.output.file_artifacts[0].sha256 = "0".repeat(64)
    exported.part.state.output = JSON.stringify(receipt)
    expect((await check(corrupted)).failures.join(" ")).toContain("export")
    const saved = events.find((e: any) => e.part.tool.endsWith("action_run"))
    expect((await check([saved, ...events.filter((e: any) => e !== saved)])).failures.join(" ")).toContain("save")
    expect((await check(events.filter((e: any) => !e.part.tool.endsWith("artifact_deliver")))).failures.join(" ")).toContain("input")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("готовый CrossTable с mapping/read/export/save без создания в текущем прогоне получает FAIL", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-creation-"))
  try {
    const task = path.join(import.meta.dir, "../tasks/node-evals/crosstable-fixed-sum")
    await cp(path.join(task, "reference.lgp"), path.join(root, "artifact/package.lgp"), { recursive: true })
    const unpack = Bun.spawn(["unzip", "-q", path.join(root, "artifact/package.lgp"), "-d", path.join(root, "artifact/unpacked")])
    expect(await unpack.exited).toBe(0)
    await Bun.write(path.join(root, "artifact/results/node-evals-crosstable-fixed-sum-3.result.csv"), await Bun.file(path.join(task, "oracle.csv")).text())
    const events = await Bun.file(new URL("fixtures/node-evals/fixed-sum-protocol.json", import.meta.url)).json()
    await Bun.write(path.join(root, "events.jsonl"), events.map((event: unknown) => JSON.stringify(event)).join("\n"))
    expect(await validateNodeAttempt(task, root, "/user/node-evals-crosstable-fixed-sum-3.lgp")).toEqual({ errors: [], failures: [] })
    const existing = events.filter((event: { part: { state: { input: { operation_id?: string } } } }) =>
      event.part.state.input.operation_id !== "cross-sales-3")
    await Bun.write(path.join(root, "events.jsonl"), existing.map((event: unknown) => JSON.stringify(event)).join("\n"))
    const result = await validateNodeAttempt(task, root, "/user/node-evals-crosstable-fixed-sum-3.lgp")
    expect(result.errors).toEqual([])
    expect(result.failures.join(" ")).toContain("creation")
  } finally { await rm(root, { recursive: true, force: true }) }
})
