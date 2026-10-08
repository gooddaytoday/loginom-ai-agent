import { expect, test } from "bun:test"
import { nodeCase } from "../src/node-cases"

test("assigned coverage IDs have exact ordered typed roles and native proof contracts", () => {
  const strings = nodeCase("crosstable-string-counts-null")
  expect(strings.facts).toEqual([{ name: "Text", type: "string", functions: ["count", "unique_count", "null_count"], mask: 386 }])
  expect(nodeCase("crosstable-column-cartesian").dimensions).toEqual(["Category", "Channel"])
  expect(nodeCase("crosstable-multi-facts").facts).toEqual([
    { name: "Amount", type: "real", functions: ["sum"], mask: 1 },
    { name: "Units", type: "integer", functions: ["max"], mask: 8 },
  ])
  expect(nodeCase("crosstable-local-variable-bindings").mode).toBe("sliding")
  expect(() => nodeCase("unassigned")).toThrow("unsupported node case")
})
