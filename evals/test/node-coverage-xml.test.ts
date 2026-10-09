import { expect, test } from "bun:test"
import { checkNodeXml, type PackageXml } from "../src/node-xml"

function fixture(id: string): PackageXml {
  const strings = id.endsWith("string-counts-null")
  const multi = id.endsWith("multi-facts")
  const dimensions = id.endsWith("column-cartesian") ? ["Category", "Channel"] : ["Category"]
  const column = (Name: string, DataType: string, UsageType: string, Order: number, AggregationTypes = "") => ({
    Name, InputColumnInfoName: Name, DataType, DataKind: DataType === "dtString" ? "dkDiscrete" : "dkContinuous", UsageType,
    extension: { Order: String(Order), AggregationTypes, NullGroup: "false", OtherGroup: "false", SlidingUniqueValuesMinCount: "0" },
  })
  return { links: [], nodes: [{ scope: "unit", id: "cross", type: "TBGCrossTabEngine", engine: { SlidingUniqueValues: "false" }, inputs: {}, outputs: {}, variables: [], columns: [
    column("Region", "dtString", "utActive", 0), ...dimensions.map((d, i) => column(d, "dtString", "utGroup", i)),
    column(strings ? "Text" : "Amount", strings ? "dtString" : "dtFloat", "utValue", 0, strings ? "ctatCount ctatUniqueCount ctatNullCount" : "ctatSum"),
    ...(multi ? [column("Units", "dtInteger", "utValue", 1, "ctatMax")] : []),
  ] }] }
}

for (const id of ["crosstable-string-counts-null", "crosstable-column-cartesian", "crosstable-multi-facts"]) {
  test(`${id}: persisted exact roles/types/functions and ordered dimensions/facts`, () => {
    const check = (xml: PackageXml) => checkNodeXml(xml, id, new Set(["crosstable"])).failures
    expect(check(fixture(id))).toEqual([])
    const mutations = [
      (xml: PackageXml) => { xml.nodes[0]!.engine.SlidingUniqueValues = "true" },
      (xml: PackageXml) => { xml.nodes[0]!.columns.pop() },
      (xml: PackageXml) => { xml.nodes[0]!.columns.at(-1)!.DataType = "dtString" === xml.nodes[0]!.columns.at(-1)!.DataType ? "dtFloat" : "dtString" },
      (xml: PackageXml) => { xml.nodes[0]!.columns.at(-1)!.extension.AggregationTypes = "ctatSum ctatCount" },
      (xml: PackageXml) => { xml.nodes[0]!.columns.at(-1)!.extension.Order = "8" },
      (xml: PackageXml) => { xml.nodes[0]!.columns[1]!.extension.NullGroup = "true" },
      (xml: PackageXml) => { xml.nodes[0]!.columns[1]!.UsageType = "utActive" },
      (xml: PackageXml) => { xml.nodes[0]!.columns[1]!.InputColumnInfoName = "other" },
    ]
    if (id.endsWith("column-cartesian")) mutations.push(xml => { xml.nodes[0]!.columns[1]!.extension.Order = "1"; xml.nodes[0]!.columns[2]!.extension.Order = "0" })
    if (id.endsWith("multi-facts")) mutations.push(xml => { xml.nodes[0]!.columns[2]!.extension.Order = "1"; xml.nodes[0]!.columns[3]!.extension.Order = "0" })
    for (const mutate of mutations) {
      const xml = fixture(id); mutate(xml)
      expect(check(xml).length).toBeGreaterThan(0)
    }
  })
}
