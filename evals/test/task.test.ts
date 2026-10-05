import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, writeFile, cp, mkdir, rm } from "node:fs/promises"
import os from "node:os"
import { loadTasks, agentInputsHash, rubricHash, buildAgentPrompt, taskTimeoutMs } from "../src/task"
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

test("loadTasks: посторонний каталог без task.json не мешает загрузке задач", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-task-discovery-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    await mkdir(path.join(dir, "empty"))
    expect((await loadTasks(dir)).map((task) => task.id)).toEqual(["group-sum-qty"])
    await expect(loadTasks(dir, ["empty"])).rejects.toThrow("empty: нет task.json")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
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

test("loadTasks: required принимает только boolean и по умолчанию выключен", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-required-task-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    const file = path.join(dir, "group-sum-qty", "task.json")
    const raw = await Bun.file(file).json()
    for (const value of ["true", null, 1]) {
      raw.checklist[0].required = value
      await Bun.write(file, JSON.stringify(raw))
      await expect(loadTasks(dir)).rejects.toThrow("group-sum-qty: checklist[0].required должен быть boolean")
    }
    raw.checklist[0].required = true
    await Bun.write(file, JSON.stringify(raw))
    expect((await loadTasks(dir))[0]?.checklist[0]?.required).toBe(true)
    delete raw.checklist[0].required
    await Bun.write(file, JSON.stringify(raw))
    expect((await loadTasks(dir))[0]?.checklist[0]?.required).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("rubricHash: обязательность смыслового пункта меняет рубрику, сохраняя входы агента", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-required-hash-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    const before = await loadTasks(dir)
    const file = path.join(dir, "group-sum-qty", "task.json")
    const raw = await Bun.file(file).json()
    raw.checklist.find((item: { id: string }) => item.id === "group-sum").required = false
    await Bun.write(file, JSON.stringify(raw))
    const after = await loadTasks(dir)
    expect(await rubricHash(after)).not.toBe(await rubricHash(before))
    expect(await agentInputsHash(after)).toBe(await agentInputsHash(before))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
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

test("agentInputsHash: изменение инструкции сохранения меняет идентичность входов", async () => {
  const tasks = await loadTasks(tasksDir, ["group-sum-qty"])
  expect(await agentInputsHash(tasks, "Сохрани пакет и результат"))
    .not.toBe(await agentInputsHash(tasks, "Сохрани только пакет"))
})

test("buildAgentPrompt: подставляет пакет и CSV в общую инструкцию", () => {
  expect(buildAgentPrompt("Построй сценарий", "/user/eval-run.lgp", "eval-run.result.csv")).toBe(
    "Построй сценарий\n\nСохрани готовый пакет как `/user/eval-run.lgp`. " +
    "Если задача требует выгрузку в файл, назови его `eval-run.result.csv`. " +
    "Уточняющих вопросов не задавай — принимай разумные решения самостоятельно и доведи задачу до конца.",
  )
})

test("loadTasks: обнаруживает CSV oracle и фиксирует числовой допуск", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-oracle-task-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    await Bun.write(path.join(dir, "group-sum-qty", "oracle.csv"), "group,qty\nA,15\nB,25\n")
    const [task] = await loadTasks(dir)
    expect(task?.oracle).toBe("oracle.csv")
    expect(task?.oracleTolerance).toBe(0.01)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("rubricHash: изменение oracle меняет рубрику, но не входы агента", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-oracle-hash-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    const oracle = path.join(dir, "group-sum-qty", "oracle.csv")
    await Bun.write(oracle, "group,qty\nA,15\nB,25\n")
    const tasks = await loadTasks(dir)
    const rubric = await rubricHash(tasks)
    const inputs = await agentInputsHash(tasks)
    await Bun.write(oracle, "group,qty\nA,16\nB,25\n")
    expect(await rubricHash(tasks)).not.toBe(rubric)
    expect(await agentInputsHash(tasks)).toBe(inputs)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("loadTasks: заданный oracle_tolerance применяется и меняет рубрику", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-oracle-tolerance-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    await Bun.write(path.join(dir, "group-sum-qty", "oracle.csv"), "group,qty\nA,15\nB,25\n")
    const before = await loadTasks(dir)
    const file = path.join(dir, "group-sum-qty", "task.json")
    const raw = await Bun.file(file).json()
    await Bun.write(file, JSON.stringify({ ...raw, oracle_tolerance: 0 }))
    const after = await loadTasks(dir)
    expect(after[0]?.oracleTolerance).toBe(0)
    expect(await rubricHash(after)).not.toBe(await rubricHash(before))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("taskTimeoutMs: общий флаг перекрывает лимит задачи, затем используется env default", async () => {
  const [task] = await loadTasks(tasksDir, ["group-sum-qty"])
  const config = { timeoutMs: undefined, taskTimeoutMs: 900_000 }
  expect(taskTimeoutMs(config, { ...task!, timeoutMs: 120_000 })).toBe(120_000)
  expect(taskTimeoutMs({ ...config, timeoutMs: 60_000 }, { ...task!, timeoutMs: 120_000 })).toBe(60_000)
  expect(taskTimeoutMs(config, task!)).toBe(900_000)
})

test("loadTasks: некорректный oracle_tolerance отклоняется до прогона", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-oracle-invalid-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    const file = path.join(dir, "group-sum-qty", "task.json")
    const raw = await Bun.file(file).json()
    for (const tolerance of [null, -1, "0.01"]) {
      await Bun.write(file, JSON.stringify({ ...raw, oracle_tolerance: tolerance }))
      await expect(loadTasks(dir)).rejects.toThrow("group-sum-qty: oracle_tolerance")
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("loadTasks: явно заданная axis сохраняется в рубрике", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-axis-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    const file = path.join(dir, "group-sum-qty", "task.json")
    const raw = await Bun.file(file).json()
    raw.checklist[0].axis = "structure"
    await Bun.write(file, JSON.stringify(raw))
    expect((await loadTasks(dir))[0]!.checklist[0]!.axis).toBe("structure")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("loadTasks: неизвестная axis отклоняется", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-axis-invalid-"))
  try {
    await cp(path.join(tasksDir, "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    const file = path.join(dir, "group-sum-qty", "task.json")
    const raw = await Bun.file(file).json()
    for (const axis of ["guess", null, 1]) {
      raw.checklist[0].axis = axis
      await Bun.write(file, JSON.stringify(raw))
      await expect(loadTasks(dir)).rejects.toThrow("axis должна быть")
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("loadTasks: все core рубрики явно разделяют структуру, результат и ответ", async () => {
  for (const task of await loadTasks(tasksDir)) {
    expect(task.checklist.every((item) => item.axis !== undefined)).toBe(true)
    expect(task.checklist.find((item) => item.id === "result-rows")!.axis).toBe("result")
    expect(task.checklist.find((item) => item.id === "honest-report")!.axis).toBe("report")
    expect(task.checklist.filter((item) => item.axis === "structure")).toHaveLength(5)
  }
})
