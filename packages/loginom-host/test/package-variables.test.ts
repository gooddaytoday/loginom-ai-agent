import { expect, test } from "bun:test"
import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js"
import { extractPackageVariables } from "../src/package-docs/extract"

async function packageFixture(variables?: string) {
  const zip = new ZipWriter(new Uint8ArrayWriter())
  const options = { useWebWorkers: false }
  await zip.add("PackageInfo.xml", new TextReader('<PackageInfo Name="fixture"/>'), options)
  if (variables) await zip.add("Variables.xml", new TextReader(variables), options)
  await zip.add("Unit_0/Unit.xml", new TextReader(`
    <Unit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><WorkFlow><Nodes>
      <Item Guid="import" DisplayName="Импорт"><Component>
        <Engine FileName="%INPUT%/%INPUT%.csv"/><PropBinder><PropertyBindSavers>
          <Item VariableName="limit" PropertyPath="Limit.Engine.Root."/>
        </PropertyBindSavers></PropBinder>
        <InputSockets><Item><Socket><Variables><Elements>
          <Item Name="limit" DataType="dtInteger"><DefaultValue Value="12"/></Item>
        </Elements></Variables></Socket></Item></InputSockets>
      </Component></Item>
      <Item Guid="submodel" DisplayName="Ветка"><Component><Engine xsi:type="TBGModelGenericComponentEngine">
        <ModelUnit><WorkFlow><Nodes><Item Guid="export" DisplayName="Экспорт"><Component>
          <Engine TableName="rows_%limit%" Query="%NOT_A_TEMPLATE%"/>
        </Component></Item></Nodes></WorkFlow></ModelUnit>
      </Engine></Component></Item>
    </Nodes><Annotations><Item Text="%NOTE%"/></Annotations></WorkFlow></Unit>`), options)
  return zip.close()
}

test("reads saved package definitions and defaults separately from observed control-variable references", async () => {
  const result = await extractPackageVariables(await packageFixture(`
    <Variables xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Elements>
      <Item Name="INPUT" DataType="dtString"><DefaultValue xsi:type="TBGStringVariableContainer" Value=""/></Item>
      <Item Name="limit" DataType="dtInteger"><DefaultValue xsi:type="TBGIntegerVariableContainer" Value="0"/></Item>
      <Item Name="enabled" DataType="dtBoolean"><DefaultValue xsi:type="TBGBooleanVariableContainer" Value="false"/></Item>
      <Item Name="unset" DataType="dtString"/>
    </Elements></Variables>`))
  expect(result).toEqual({
    source: "saved", definitionsCoverage: "complete", usagesCoverage: "partial",
    definitions: [
      { name: "INPUT", type: "dtString" }, { name: "limit", type: "dtInteger" },
      { name: "enabled", type: "dtBoolean" }, { name: "unset", type: "dtString" },
    ],
    defaults: [
      { name: "INPUT", value: "" }, { name: "limit", value: "0" }, { name: "enabled", value: "false" },
    ],
    usages: [
      { kind: "template", scope: "control", name: "INPUT", module: "Unit_0", branch: [], nodeID: "import", nodeLabel: "Импорт", parameter: "FileName" },
      { kind: "binding", scope: "control", name: "limit", module: "Unit_0", branch: [], nodeID: "import", nodeLabel: "Импорт", parameter: "Limit.Engine.Root." },
      { kind: "template", scope: "control", name: "limit", module: "Unit_0", branch: ["Ветка"], nodeID: "export", nodeLabel: "Экспорт", parameter: "TableName" },
    ],
  })
})

test("distinguishes an unread registry from a verified empty registry", async () => {
  expect(await extractPackageVariables(await packageFixture())).toMatchObject({ definitionsCoverage: "unavailable", definitions: null, defaults: null })
  expect(await extractPackageVariables(await packageFixture("<Variables><Elements/></Variables>")))
    .toMatchObject({ definitionsCoverage: "complete", definitions: [] })
})
