import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt, validateNodeRun } from "../src/node-evals"

test("неизвестный case ID получает ERROR до проверки артефакта", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-unknown-case-"))
  try {
    await Bun.write(path.join(directory, "task.json"), JSON.stringify({ id: "crosstable-unregistered", checklist: [] }))
    const result = await validateNodeAttempt(directory, directory)
    expect(result.errors.join(" ")).toContain("unsupported node case")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

async function writeSummary(file: string, source: string) {
  await Bun.write(file, source)
  const summary = JSON.parse(source)
  for (const task of summary.tasks ?? []) await Bun.write(path.join(path.dirname(file), "cases", task.id, "task.json"), JSON.stringify({
    id: task.id, checklist: [{ id: "crosstable", required: true }],
  }))
  for (const task of summary.tasks ?? []) for (const attempt of task.attempts ?? []) {
    if (attempt.environment_cleanup?.status !== "confirmed") continue
    await Bun.write(path.join(path.dirname(file), task.id, String(attempt.attempt), "cleanup.json"), JSON.stringify({
      processes: { status: "confirmed" }, stages: ["processes", "diagnostics", "writer", "ready", "pruning"].map(stage => ({ stage, status: "confirmed" })),
      result: { status: "confirmed", error: null },
    }))
  }
}

test("неизвестный case ID остаётся ERROR/2 при failed попытке", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-unknown-run-"))
  try {
    const id = "crosstable-unregistered"
    await writeSummary(path.join(directory, "summary.json"), JSON.stringify({ config: { repeat: 1 }, storage_leftovers: [],
      tasks: [{ id, attempts: [{ attempt: 1, status: "failed", environment_cleanup: { status: "confirmed" } }] }] }))
    const result = await validateNodeRun(directory, [id], path.join(directory, "cases"))
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("unsupported node case")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("незавершённый run получает ERROR/2, даже если generic harness завершился успешно", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await writeSummary(path.join(directory, "summary.json"), JSON.stringify({
      interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
      config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [] }],
    }))
    const result = await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("incomplete")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("исключение валидатора и отсутствующий cleanup.json становятся ERROR/2", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "summary.json"), "{broken")
    expect(await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))).toMatchObject({ verdict: "ERROR", code: 2 })
    await Bun.write(path.join(directory, "summary.json"), JSON.stringify({ config: { repeat: 1 }, storage_leftovers: [],
      tasks: [{ id: "crosstable-fixed-sum", attempts: [{ attempt: 1, status: "failed", environment_cleanup: { status: "confirmed" } }] }] }))
    expect(await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))).toMatchObject({ verdict: "ERROR", code: 2 })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("unknown required ID остаётся ERROR при failed попытке", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await writeSummary(path.join(directory, "summary.json"), JSON.stringify({ config: { repeat: 1 }, storage_leftovers: [],
      tasks: [{ id: "crosstable-fixed-sum", attempts: [{ attempt: 1, status: "failed", environment_cleanup: { status: "confirmed" } }] }] }))
    await Bun.write(path.join(directory, "cases/crosstable-fixed-sum/task.json"), JSON.stringify({ id: "crosstable-fixed-sum", checklist: [{ id: "unsupported", required: true }] }))
    expect(await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))).toMatchObject({ verdict: "ERROR", code: 2 })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("oracle проверяет порядок строк, лишнюю колонку и отсутствие CSV, допускает перестановку колонок", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "task.json"), JSON.stringify({
      id: "crosstable-fixed-sum", oracle_tolerance: 0, checklist: [{ id: "result", required: true }],
    }))
    await Bun.write(path.join(directory, "oracle.csv"), "Region,A,B\nN,15,7\nS,3,2\n")
    await Bun.write(path.join(directory, "attempt/artifact/package.lgp"), "package placeholder for isolated CSV test")
    const resultFile = path.join(directory, "attempt/artifact/results/table.result.csv")
    for (const csv of ["Region,A,B\nS,3,2\nN,15,7\n", "Region,A,B,extra\nN,15,7,0\nS,3,2,0\n"]) {
      await Bun.write(resultFile, csv)
      expect((await validateNodeAttempt(directory, path.join(directory, "attempt"))).failures.length).toBeGreaterThan(0)
    }
    await Bun.write(resultFile, "B,Region,A\n7,N,15\n2,S,3\n")
    expect((await validateNodeAttempt(directory, path.join(directory, "attempt"))).failures).toEqual([])
    await rm(resultFile)
    expect((await validateNodeAttempt(directory, path.join(directory, "attempt"))).failures.length).toBeGreaterThan(0)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("правильные значения с разделителем точка с запятой нарушают CSV контракт", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "task.json"), JSON.stringify({
      id: "crosstable-fixed-sum", oracle_tolerance: 0, checklist: [{ id: "result", required: true }],
    }))
    await Bun.write(path.join(directory, "oracle.csv"), "Region,A,B\nN,15,7\nS,3,2\n")
    await Bun.write(path.join(directory, "attempt/artifact/package.lgp"), "package placeholder for isolated CSV test")
    await Bun.write(path.join(directory, "attempt/artifact/results/table.result.csv"), "Region;A;B\nN;15;7\nS;3;2\n")
    const result = await validateNodeAttempt(directory, path.join(directory, "attempt"))
    expect(result.failures.join(" ")).toContain("comma")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("каждая ячейка CSV проверяется с tolerance=0 даже при существующем пакете", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "task.json"), JSON.stringify({
      id: "crosstable-fixed-sum", oracle_tolerance: 0, checklist: [{ id: "result", required: true }],
    }))
    await Bun.write(path.join(directory, "oracle.csv"), "Region,A,B\nN,15,7\nS,3,2\n")
    await Bun.write(path.join(directory, "attempt/artifact/package.lgp"), "package placeholder for isolated CSV test")
    await Bun.write(path.join(directory, "attempt/artifact/results/table.result.csv"), "Region,A,B\nN,15.0001,7\nS,3,2\n")
    const result = await validateNodeAttempt(directory, path.join(directory, "attempt"))
    expect(result.failures.join(" ")).toContain("result:")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("итог completed с подтверждённым cleanup всё равно проверяет обязательный локальный пакет", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await writeSummary(path.join(directory, "summary.json"), JSON.stringify({
      interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
      config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
        { attempt: 1, status: "completed", cleanup_error: null, environment_cleanup: { status: "confirmed" } },
      ] }],
    }))
    await Bun.write(path.join(directory, "cases/crosstable-fixed-sum/task.json"), JSON.stringify({
      id: "crosstable-fixed-sum", checklist: [{ id: "crosstable", required: true }],
    }))
    expect(await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))).toMatchObject({ verdict: "FAIL", code: 1 })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("отсутствующий локальный пакет является FAIL, а не успешным пустым чеклистом", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "task.json"), JSON.stringify({
      id: "crosstable-fixed-sum", checklist: [{ id: "crosstable", required: true }],
    }))
    const result = await validateNodeAttempt(directory, path.join(directory, "attempt"))
    expect(result.errors).toEqual([])
    expect(result.failures.join(" ")).toContain("package.lgp")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("неизвестный required checklist ID — ошибка валидатора, даже при отсутствующем артефакте", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "task.json"), JSON.stringify({
      id: "crosstable-fixed-sum", checklist: [{ id: "unimplemented-rule", required: true }],
    }))
    const result = await validateNodeAttempt(directory, path.join(directory, "attempt"))
    expect(result.errors.join(" ")).toContain("unknown required ID")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("interrupted, остановка и неизвестный листинг storage имеют приоритет ERROR над FAIL", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    for (const overrides of [{ interrupted: true }, { stopped_reason: "preparation failed" }, { storage_leftovers: null }]) {
      await writeSummary(path.join(directory, "summary.json"), JSON.stringify({
        interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
        config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
          { attempt: 1, status: "failed", cleanup_error: null, environment_cleanup: { status: "confirmed" } },
        ] }], ...overrides,
      }))
      expect(await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))).toMatchObject({ verdict: "ERROR", code: 2 })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("failed/timeout/no_artifact — FAIL/1, а generic pass=null не создаёт PASS", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    for (const status of ["failed", "timeout", "no_artifact"]) {
      await writeSummary(path.join(directory, "summary.json"), JSON.stringify({
        interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
        config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
          { attempt: 1, status, pass: null, cleanup_error: null, environment_cleanup: { status: "confirmed" } },
        ] }],
      }))
      expect(await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))).toMatchObject({ verdict: "FAIL", code: 1 })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("completed без подтверждённого cleanup получает ERROR/2", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await writeSummary(path.join(directory, "summary.json"), JSON.stringify({
      interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
      config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
        { attempt: 1, status: "completed", cleanup_error: null, environment_cleanup: { status: "not_run" } },
      ] }],
    }))
    const result = await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("cleanup")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("unit_after_exit не подтверждает очистку node-run даже при confirmed stages", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await writeSummary(path.join(directory, "summary.json"), JSON.stringify({
      interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
      config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
        { attempt: 1, status: "failed", cleanup_error: null, environment_cleanup: { status: "confirmed" } },
      ] }],
    }))
    const evidence = Bun.file(path.join(directory, "crosstable-fixed-sum/1/cleanup.json"))
    const cleanup = await evidence.json()
    await Bun.write(evidence, JSON.stringify({ ...cleanup, processes: { ...cleanup.processes, observation_mode: "unit_after_exit" } }))
    const result = await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("unit_after_exit")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("infra_error при полном наборе попыток получает ERROR/2 и сохраняет исходный infra retry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await writeSummary(path.join(directory, "summary.json"), JSON.stringify({
      interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
      config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
        { attempt: 1, status: "infra_error", environment_cleanup: { status: "confirmed" },
          infra_retry: { initial: { status: "infra_error" } } },
      ] }],
    }))
    const result = await validateNodeRun(directory, ["crosstable-fixed-sum"], path.join(directory, "cases"))
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("infra_error")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
