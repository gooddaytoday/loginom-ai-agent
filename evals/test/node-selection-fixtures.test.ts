import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { compareCsv } from "../src/oracle"
import { loadTasks, buildAgentPrompt } from "../src/task"

const fixtures = path.join(import.meta.dir, "../fixtures/node-selection")

test("explicit JS keeps the analytic task and inputs, with only the requested aggregation override", async () => {
  const [original] = await loadTasks(path.join(import.meta.dir, "../tasks/analytic"), ["sales-by-category"])
  const [task] = await loadTasks(fixtures, ["explicit-js"])
  expect(task!.prompt).toBe(original!.prompt.replace("Упорядочь", "Агрегацию по категориям выполни узлом JavaScript. Упорядочь"))
  expect(task!.inputs).toEqual(["data/dataset.csv"])
  expect(await Bun.file(path.join(task!.dir, task!.inputs[0]!)).text())
    .toBe(await Bun.file(path.join(original!.dir, original!.inputs[0]!)).text())
  expect(await Bun.file(path.join(task!.dir, task!.oracle!)).text())
    .toBe(await Bun.file(path.join(original!.dir, original!.oracle!)).text())
  expect(task!.outputMode).toBe("diagnostic")
  expect(task!.reference).toBe("")
  expect(task!.checklist.some(item => item.id === "group-category")).toBe(false)
  expect(task!.checklist.find(item => item.id === "javascript-aggregation")?.text).toContain("JavaScript")
  const prompt = buildAgentPrompt(task!.prompt, "/owned/package.lgp", "owned.result.csv")
  expect(prompt).toContain("Сохрани готовый пакет как `/owned/package.lgp`")
  expect(prompt).not.toContain("Ожидаемый отказ не требует успешного пакета")
  expect(prompt).not.toContain("128603.14")
})

test("tags input generator and independent oracle cover varied lists and the long row", async () => {
  const [task] = await loadTasks(fixtures, ["tags"])
  const directory = await mkdtemp(path.join(tmpdir(), "node-selection-tags-"))
  const generated = Bun.spawn(["python3", path.join(task!.dir, "generate.py"), path.join(directory, "dataset.csv")])
  const generatedExit = await generated.exited
  const input = await Bun.file(path.join(directory, "dataset.csv")).text()
  const oracle = Bun.spawn(["python3", path.join(task!.dir, "oracle.py"), path.join(directory, "dataset.csv")], { stdout: "pipe" })
  const output = await new Response(oracle.stdout).text()
  const oracleExit = await oracle.exited
  await rm(directory, { recursive: true, force: true })
  expect(generatedExit).toBe(0)
  expect(oracleExit).toBe(0)
  expect(input).toBe(await Bun.file(path.join(task!.dir, task!.inputs[0]!)).text())
  expect(input.trimEnd().split("\n")).toHaveLength(6)
  expect(output).toBe("Tag,Occurrences\nblue,3\ngreen,1\nred,153\n")
  expect(compareCsv(await Bun.file(path.join(task!.dir, task!.oracle!)).text(), output, 0).passed).toBe(true)
  expect(task!.inputs).toEqual(["data/dataset.csv"])
  expect(task!.outputMode).toBe("diagnostic")
  expect(task!.prompt).not.toMatch(/red|blue|153/)
})

test("recovery loads with the other local cases and independently computes only Category and Profit", async () => {
  const tasks = await loadTasks(fixtures)
  expect(tasks.map(task => task.id)).toEqual(["explicit-js", "recovery", "tags"])
  const task = tasks.find(task => task.id === "recovery")!
  const oracle = Bun.spawn(["python3", path.join(task.dir, "oracle.py"), path.join(task.dir, task.inputs[0]!)], { stdout: "pipe" })
  const output = await new Response(oracle.stdout).text()
  expect(await oracle.exited).toBe(0)
  expect(output).toBe("Category,Profit\nB,62\nA,55\n")
  expect(compareCsv(await Bun.file(path.join(task.dir, task.oracle!)).text(), output, 0).passed).toBe(true)
  expect(tasks.every(item => item.outputMode === "diagnostic" && item.reference === "")).toBe(true)
  expect(tasks.every(item => item.inputs.length === 1 && item.inputs[0] === "data/dataset.csv")).toBe(true)
  expect(task.prompt).toContain("Revenue -")
  expect(task.prompt).toContain("CSV только с колонками Category,Profit")
  expect(task.prompt).not.toMatch(/B,62|A,55|WIZARD_CALCULATOR_VALIDATION_FAILED/)
})
