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
        <InputSockets><Item Name="ControlVariables" Guid="control"><Socket><Variables><Elements>
          <Item Name="limit" DataType="dtInteger" OriginType="iotCustom"><DefaultValue Value="12"/></Item>
        </Elements></Variables></Socket></Item></InputSockets>
      </Component></Item>
      <Item Guid="other" DisplayName="Другой"><Component>
        <Engine TableName="%INPUT%"/><InputSockets><Item Name="ControlVariables" Guid="control"/></InputSockets>
      </Component></Item>
      <Item Guid="submodel" DisplayName="Ветка"><Component><Engine xsi:type="TBGModelGenericComponentEngine">
        <ModelUnit><WorkFlow><Nodes><Item Guid="export" DisplayName="Экспорт"><Component>
          <Engine TableName="rows_%limit%" Query="%NOT_A_TEMPLATE%"/>
          <InputSockets><Item Name="ControlVariables" Guid="control"/></InputSockets>
        </Component></Item></Nodes></WorkFlow></ModelUnit>
      </Engine></Component></Item>
    </Nodes>
    <ServiceNodes><Item Name="VariablesNode" Guid="variables"><Component><OutputSockets>
      <Item Name="PackageVariables" Guid="package"/><Item Name="UserVariables" Guid="user"/>
    </OutputSockets></Component></Item></ServiceNodes>
    <ServiceLinks>
      <Item><SourcePort NodeGuid="variables" PortGuid="package"/><TargetPort NodeGuid="import" PortGuid="control"/></Item>
      <Item><SourcePort NodeGuid="variables" PortGuid="user"/><TargetPort NodeGuid="other" PortGuid="control"/></Item>
      <Item><SourcePort NodeGuid="variables" PortGuid="package"/><TargetPort NodeGuid="export" PortGuid="control"/></Item>
    </ServiceLinks>
    <Annotations><Item Text="%NOTE%"/></Annotations></WorkFlow></Unit>`), options)
  return zip.close()
}

test("uses the local workflow's package port links and keeps local control bindings separate", async () => {
  const result = await extractPackageVariables(await packageFixture(`
    <Variables xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Elements>
      <Item Name="INPUT" DataType="dtString" IsHidden="false"><DefaultValue xsi:type="TBGStringVariableContainer" Value=""/></Item>
      <Item Name="limit" DataType="dtInteger" IsHidden="false"><DefaultValue xsi:type="TBGIntegerVariableContainer" Value="0"/></Item>
      <Item Name="enabled" DataType="dtBoolean" IsHidden="false"><DefaultValue xsi:type="TBGBooleanVariableContainer" Value="false"/></Item>
      <Item Name="unset" DataType="dtString"/>
    </Elements></Variables>`))
  expect(result).toEqual({
    source: "saved", definitionsCoverage: "complete", defaultsCoverage: "complete", usagesCoverage: "partial",
    definitions: [
      { name: "INPUT", type: "dtString" }, { name: "limit", type: "dtInteger" },
      { name: "enabled", type: "dtBoolean" }, { name: "unset", type: "dtString" },
    ],
    defaults: [
      { name: "INPUT", value: "" }, { name: "limit", value: "0" }, { name: "enabled", value: "false" },
    ],
    usages: [
      { kind: "template", scope: "package", name: "INPUT", module: "Unit_0", branch: [], nodeID: "import", nodeLabel: "Импорт", parameter: "FileName" },
      { kind: "binding", scope: "control", name: "limit", module: "Unit_0", branch: [], nodeID: "import", nodeLabel: "Импорт", parameter: "Limit.Engine.Root." },
      { kind: "template", scope: "control", name: "INPUT", module: "Unit_0", branch: [], nodeID: "other", nodeLabel: "Другой", parameter: "TableName" },
      { kind: "template", scope: "control", name: "limit", module: "Unit_0", branch: ["Ветка"], nodeID: "export", nodeLabel: "Экспорт", parameter: "TableName" },
    ],
  })
})

test("withholds hidden or unverified values while preserving the definitions", async () => {
  const result = await extractPackageVariables(await packageFixture(`<Variables><Elements>
    <Item Name="explicit" DataType="dtString" Hidden="true"><DefaultValue Value="hidden-example"/></Item>
    <Item Name="unknown" DataType="dtString"><DefaultValue Value="unverified-example"/></Item>
    <Item Name="conflicting" DataType="dtString" Hidden="false" IsHidden="true"><DefaultValue Value="conflicting-example"/></Item>
  </Elements></Variables>`))
  expect(result.definitions?.map(({ name }) => name)).toEqual(["explicit", "unknown", "conflicting"])
  expect(result.defaultsCoverage).toBe("partial")
  expect(result.defaults).toEqual([])
})

test("distinguishes an unread registry from a verified empty registry", async () => {
  expect(await extractPackageVariables(await packageFixture())).toMatchObject({ definitionsCoverage: "unavailable", definitions: null, defaults: null })
  expect(await extractPackageVariables(await packageFixture("<Variables><Elements/></Variables>")))
    .toMatchObject({ definitionsCoverage: "complete", definitions: [] })
})
