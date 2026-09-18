import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, writeFile, cp } from "node:fs/promises"
import os from "node:os"
import { loadTasks, agentInputsHash, rubricHash } from "../src/task"
import { evalsRoot } from "../src/config"
import { EvalFailure } from "../src/fail"

const tasksDir = path.join(evalsRoot, "tasks")

test("loadTasks: читает три core-задачи в порядке id", async () => {
  const tasks = await loadTasks(tasksDir)
  expect(tasks.map((task) => task.id)).toEqual(["calc-data-double", "filter-active-rows", "group-sum-qty"])
  const group = tasks.find((task) => task.id === "group-sum-qty")!
  expect(group.inputs).toEqual(["data/sales.csv"])
  expect(group.checklist.map((item) => item.id)).toContain("result-rows")
  expect(group.checklist.find((item) => item.id === "result-rows")?.requiresResultFile).toBe(true)
  expect(group.checklist.find((item) => item.id === "honest-report")?.requiresRun).toBe(true)
  expect(group.checklist.find((item) => item.id === "import-csv")?.requiresRun).toBe(false)
  expect(group.checklist.find((item) => item.id === "import-csv")?.weight).toBe(1)
  expect(group.timeoutMs).toBeUndefined()
})

test("loadTasks: only фильтрует, неизвестный id — EvalFailure", async () => {
  const tasks = await loadTasks(tasksDir, ["group-sum-qty"])
  expect(tasks.map((task) => task.id)).toEqual(["group-sum-qty"])
  await expect(loadTasks(tasksDir, ["nope"])).rejects.toThrow(EvalFailure)
})

test("loadTasks: дубликат id в checklist отклоняется с именем задачи", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-tasks-"))
  await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
  const file = path.join(dir, "group-sum-qty", "task.json")
  const raw = await Bun.file(file).json()
  raw.checklist.push({ ...raw.checklist[0] })
  await writeFile(file, JSON.stringify(raw))
  await expect(loadTasks(dir)).rejects.toThrow("group-sum-qty: повторяющиеся id")
})

test("loadTasks: битый или не-объектный task.json отклоняется с именем задачи", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-tasks-"))
  await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
  const file = path.join(dir, "group-sum-qty", "task.json")
  for (const broken of ["{ битый json", "null", "[]"]) {
    await writeFile(file, broken)
    await expect(loadTasks(dir)).rejects.toThrow(EvalFailure)
    await expect(loadTasks(dir)).rejects.toThrow("group-sum-qty: task.json")
  }
})

test("loadTasks: requires_run не-boolean отклоняется с именем задачи", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-tasks-"))
  await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
  const file = path.join(dir, "group-sum-qty", "task.json")
  const raw = await Bun.file(file).json()
  raw.checklist[0].requires_run = "true"
  await writeFile(file, JSON.stringify(raw))
  await expect(loadTasks(dir)).rejects.toThrow(EvalFailure)
  await expect(loadTasks(dir)).rejects.toThrow("group-sum-qty: checklist[0].requires_run должен быть boolean")
})

test("loadTasks: requires_result_file не-boolean отклоняется с именем задачи", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-tasks-"))
  await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
  const file = path.join(dir, "group-sum-qty", "task.json")
  const raw = await Bun.file(file).json()
  raw.checklist[0].requires_result_file = "true"
  await writeFile(file, JSON.stringify(raw))
  await expect(loadTasks(dir)).rejects.toThrow(EvalFailure)
  await expect(loadTasks(dir)).rejects.toThrow("group-sum-qty: checklist[0].requires_result_file должен быть boolean")
})

test("hashes: смена prompt меняет agent_inputs_hash и не меняет rubric_hash", async () => {
  const original = await loadTasks(tasksDir, ["group-sum-qty"])
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-tasks-"))
  await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
  const file = path.join(dir, "group-sum-qty", "task.json")
  const raw = await Bun.file(file).json()
  raw.prompt = `${raw.prompt} (изменено)`
  await writeFile(file, JSON.stringify(raw))
  const changed = await loadTasks(dir)
  expect(await agentInputsHash(changed)).not.toBe(await agentInputsHash(original))
  expect(await rubricHash(changed)).toBe(await rubricHash(original))
})
