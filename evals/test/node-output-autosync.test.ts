import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"
import { readNodeEvents } from "../src/node-events"

for (const prefix of ["multi-facts", "min-max"]) {
  test(`${prefix}: saved AutoSync inherits unchanged row keys without explicit output definitions`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "node-output-autosync-"))
    try {
      const task = path.join(import.meta.dir, "../tasks/node-evals", `crosstable-${prefix}`)
      const protocol = await Bun.file(new URL(`fixtures/node-evals/${prefix}-protocol.json`, import.meta.url)).json()
      const events = protocol.map((event: unknown) => JSON.stringify(event)).join("\n")
      const exported = readNodeEvents(events).calls.find(call => call.output.output?.file_artifacts?.length)
      await Bun.write(path.join(root, "data/sales.csv"), Bun.file(path.join(task, "data/sales.csv")))
      await Bun.write(path.join(root, "artifact/results", path.posix.basename(exported!.output.output.file_artifacts[0].destination)), Bun.file(path.join(task, "oracle.csv")))
      await Bun.write(path.join(root, "events.jsonl"), events)
      await Bun.write(path.join(root, "native-crosstable.json"), Bun.file(new URL(`fixtures/node-evals/${prefix}-native.json`, import.meta.url)))
      async function check(change = "") {
        const child = Bun.spawn(["python3", "-c", `
import sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
tree = ET.parse(sys.argv[1])
cross = next(n for n in tree.findall(".//WorkFlow/Nodes/Item") if n.find("./Component/Engine").get("{http://www.w3.org/2001/XMLSchema-instance}type") == "TBGCrossTabEngine")
output = cross.find("./Component/OutputSockets/Item[@Name='DataSource']/Socket/DataSource")
columns = output.find("ColumnDefs")
region = next(c for c in columns if c.get("Name") == "Region")
${change}
content = ET.tostring(tree.getroot(), encoding="utf-8")
local = Path(sys.argv[2]) / "unpacked/Unit_0/Unit.xml"
local.parent.mkdir(parents=True, exist_ok=True)
local.write_bytes(content)
with zipfile.ZipFile(Path(sys.argv[2]) / "package.lgp", "w") as archive:
    archive.writestr("Unit_0/Unit.xml", content)
`, path.join(import.meta.dir, `fixtures/node-evals/${prefix}.xml`), path.join(root, "artifact")], { stdout: "pipe", stderr: "pipe" })
        const error = await new Response(child.stderr).text()
        expect(await child.exited, error).toBe(0)
        return validateNodeAttempt(task, root)
      }
      expect(await check()).toEqual({ errors: [], failures: [] })
      expect(await check('output.set("SyncThroughColumns", "true")')).toEqual({ errors: [], failures: [] })
      expect(await check('output.set("SyncThroughColumns", "true"); columns.remove(region)')).toEqual({ errors: [], failures: [] })
      for (const autosync of ['output.set("SyncThroughColumns", "false")', 'output.attrib.pop("SyncThroughColumns", None)']) {
        expect((await check(`${autosync}; columns.remove(region)`)).failures.join(" ")).toContain("mapping")
      }
      for (const change of [
        'region.find(".//Mapping").set("Source", "other")',
        'region.set("DataType", "dtFloat")',
        'region.set("Name", "renamed")',
      ]) expect((await check(`output.set("SyncThroughColumns", "true"); ${change}`)).failures.join(" ")).toContain("mapping")
      for (const change of [
        'columns.append(ET.fromstring(ET.tostring(columns[1])))',
        'columns[1].find(".//Mapping").set("Source", "other")',
        'columns[1].find(".//Mapping").set("Source", "Region")',
        'columns[1].set("DataType", "dtString")',
        'columns.remove(columns[1])',
      ]) expect((await check(`output.set("SyncThroughColumns", "true"); ${change}; columns.remove(region)`)).failures.join(" ")).toContain("mapping")
    } finally { await rm(root, { recursive: true, force: true }) }
  }, 30000)
}
