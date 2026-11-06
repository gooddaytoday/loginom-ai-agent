import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const recipe = new URL("../skills/loginom-automation/references/nodes/parent-child-recipe.md", import.meta.url)
const fixtures = new URL("../../../docs/node-development/nodes/trees-datatotree/acceptance/parent-child/expected.json", import.meta.url)

function execute(rows: { id: string; parent_id: string | null | undefined; name: string }[]) {
  const text = readFileSync(recipe, "utf8")
  const code = text.match(/```javascript\n([\s\S]*?)\n```/)?.[1]
  expect(code).toBeDefined()
  const output: Record<string, string>[] = []
  return {
    output,
    run: () => runInNewContext(code!.replace(/^import .*;\n/, ""), {
      InputTable: { RowCount: rows.length, Get: (row: number, name: keyof typeof rows[number]) => rows[row][name] },
      OutputTable: {
        Append: () => output.push({}),
        Set: (name: string, value: string) => { output[output.length - 1][name] = value },
      },
    }, { timeout: 1000 }),
  }
}

test("recipe builds the approved forest including leading zeros and child-before-parent", () => {
  const expected = JSON.parse(readFileSync(fixtures, "utf8"))
  for (const name of ["org", "multiple-roots"]) {
    const file = new URL(`../../../docs/node-development/nodes/trees-datatotree/fixtures/parent-child/${name}.csv`, import.meta.url)
    const rows = readFileSync(file, "utf8").trim().split("\n").slice(1).map((line) => {
      const [id, parent_id, label] = line.split(",")
      return { id, parent_id: parent_id || null, name: label }
    })
    const result = execute(rows)
    result.run()
    expect(result.output).toHaveLength(1)
    expect(JSON.parse(result.output[0].JSON)).toEqual(expected.cases[name].document)
  }
})

test("cycle reports all cycle members, excludes their descendants and writes no partial tree", () => {
  const result = execute([
    { id: "R", parent_id: null, name: "root" },
    { id: "tail", parent_id: "A", name: "not in cycle" },
    { id: "A", parent_id: "B", name: "a" },
    { id: "B", parent_id: "A", name: "b" },
    { id: "self", parent_id: "self", name: "c" },
  ])
  expect(result.run).toThrow("Parent-child cycle ids: A, B, self")
  expect(result.output).toEqual([])
})

test("orphan lists row ids rather than inventing roots or dropping records", () => {
  const result = execute([
    { id: "R", parent_id: "", name: "root" },
    { id: "Z", parent_id: "MISSING", name: "orphan" },
    { id: "Y", parent_id: "absent", name: "orphan 2" },
  ])
  expect(result.run).toThrow("Parent-child orphan ids: Z, Y")
  expect(result.output).toEqual([])
})

test("empty parent cells become null; empty forest is one document", () => {
  for (const parent_id of ["", null, undefined]) {
    const result = execute([{ id: "001", parent_id, name: "001" }])
    result.run()
    expect(JSON.parse(result.output[0].JSON)).toEqual({ roots: [{ id: "001", parent_id: null, name: "001", children: [] }] })
  }
  const empty = execute([])
  empty.run()
  expect(JSON.parse(empty.output[0].JSON)).toEqual({ roots: [] })
})
