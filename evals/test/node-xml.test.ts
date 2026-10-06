import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"

test("реальный XML: неверный aggregate, category mode и обход CrossTable не проходят", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-xml-"))
  try {
    await Bun.write(path.join(root, "task.json"), JSON.stringify({ id: "crosstable-fixed-sum",
      checklist: ["crosstable", "graph"].map(id => ({ id, required: true })) }))
    const xml = await Bun.file(new URL("fixtures/node-evals/fixed-sum.xml", import.meta.url)).text()
    async function validate(content: string) {
      await Bun.write(path.join(root, "artifact/unpacked/Unit_0/Unit.xml"), content)
      const child = Bun.spawn(["python3", "-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()",
        path.join(root, "artifact/package.lgp"), path.join(root, "artifact/unpacked/Unit_0/Unit.xml")])
      expect(await child.exited).toBe(0)
      return validateNodeAttempt(root, root)
    }
    expect((await validate(xml)).failures).toEqual([])
    expect((await validate(xml.replace('AggregationTypes="ctatSum"', 'AggregationTypes="ctatAvg"'))).failures.join(" ")).toContain("aggregate")
    expect((await validate(xml.replace('UniqueValueNames="true"', 'UniqueValueNames="true" SlidingUniqueValues="true"'))).failures.join(" ")).toContain("category")
    const cross = "94746d7f-26b3-48ee-9712-029525b6c757"
    const imp = "4c7275ab-ff55-48f7-aae7-02b79ae92449"
    expect((await validate(xml.replace(`<SourcePort NodeGuid="${cross}"`, `<SourcePort NodeGuid="${imp}"`))).failures.join(" ")).toContain("graph")
    const sort = `<Item Guid="sort"><InputPorts><Item Guid="in" Name="DataSource"/></InputPorts><OutputPorts><Item Guid="out" Name="DataSource"/></OutputPorts><Component><Engine xsi:type="TBGSortingEngine"/></Component></Item>`
    const extraLink = `<Item><SourcePort NodeGuid="${cross}" PortGuid="4ba0e2c2-69ad-3a32-bbdc-75714efe7a51"/><TargetPort NodeGuid="sort" PortGuid="in"/></Item>`
    const sorted = xml.replace('</Nodes>', sort + '</Nodes>').replace(`<SourcePort NodeGuid="${cross}" PortGuid="4ba0e2c2-69ad-3a32-bbdc-75714efe7a51"`, '<SourcePort NodeGuid="sort" PortGuid="out"').replace('</Links>', extraLink + '</Links>')
    expect((await validate(sorted)).failures).toEqual([])
    const bypass = `<Item><SourcePort NodeGuid="${imp}" PortGuid="58f7e6c3-511e-39d7-8853-036e0a1a7612"/><TargetPort NodeGuid="6ad8684e-6f47-4047-af92-cc010a466dae" PortGuid="9dc72a3f-56bf-3bfc-84ec-f979daf4da6b"/></Item>`
    expect((await validate(xml.replace('</Links>', bypass + '</Links>'))).failures.join(" ")).toContain("graph")
    await Bun.write(path.join(root, "task.json"), JSON.stringify({ id: "crosstable-fixed-sum",
      checklist: [{ id: "input", required: true }, { id: "export", required: true }] }))
    expect((await validate(xml)).failures.join(" ")).toContain("events")
  } finally { await rm(root, { recursive: true, force: true }) }
})
