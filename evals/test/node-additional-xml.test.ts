import { expect, test } from "bun:test"
import { checkNodeXml, type PackageXml } from "../src/node-xml"

function cross(keys: string[], aggregate: string, sliding = false): PackageXml {
  return { links: [], nodes: [{scope:"unit",id:"cross",type:"TBGCrossTabEngine",engine:{SlidingUniqueValues:String(sliding)},inputs:{},outputs:{},variables:[],
    columns:[...keys.map((Name,index)=>({Name,InputColumnInfoName:Name,DataType:"dtString",DataKind:"dkDiscrete",UsageType:"utActive",extension:{Order:String(index)}})),
      {Name:"Category",InputColumnInfoName:"Category",DataType:"dtString",DataKind:"dkDiscrete",UsageType:"utGroup",extension:{}},
      {Name:"Amount",InputColumnInfoName:"Amount",DataType:"dtFloat",DataKind:"dkContinuous",UsageType:"utValue",extension:{AggregationTypes:aggregate}}] }] }
}
const check = (xml:PackageXml,id:string)=>checkNodeXml(xml,id,new Set(["crosstable"])).failures
test("multi-row-keys сохраняет оба ключа Region затем Month и только sum",()=>{
  expect(check(cross(["Region","Month"],"ctatSum"),"crosstable-multi-row-keys")).toEqual([])
  for(const xml of [cross(["Month","Region"],"ctatSum"),cross(["Region"],"ctatSum"),cross(["Region","Month"],"ctatAvg"),cross(["Region","Month"],"ctatSum",true)])
    expect(check(xml,"crosstable-multi-row-keys").length).toBeGreaterThan(0)
  const numeric = cross(["Region","Month"],"ctatSum"); numeric.nodes[0]!.columns[3]!.DataType="dtInteger"
  expect(check(numeric,"crosstable-multi-row-keys").length).toBeGreaterThan(0)
  const swapped=cross(["Region","Month"],"ctatSum"); swapped.nodes[0]!.columns[0]!.extension.Order="1"; swapped.nodes[0]!.columns[1]!.extension.Order="0"
  expect(check(swapped,"crosstable-multi-row-keys").length).toBeGreaterThan(0)
})

test("min/max XML допускает ровно две функции; sliding XML требует sliding режим",()=>{
  expect(check(cross(["Region"],"ctatMin ctatMax"),"crosstable-min-max")).toEqual([])
  for (const functions of ["ctatMin", "ctatMax", "ctatSum ctatMin ctatMax", "ctatAvg"])
    expect(check(cross(["Region"],functions),"crosstable-min-max").length).toBeGreaterThan(0)
  expect(check(cross(["Region"],"ctatSum",true),"crosstable-sliding-source-refresh")).toEqual([])
  expect(check(cross(["Region"],"ctatSum"),"crosstable-sliding-source-refresh").length).toBeGreaterThan(0)
})
