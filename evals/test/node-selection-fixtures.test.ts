import { expect, test } from "bun:test"
import path from "node:path"
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
