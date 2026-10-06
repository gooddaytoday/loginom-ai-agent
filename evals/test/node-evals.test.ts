import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt, validateNodeRun } from "../src/node-evals"

test("незавершённый run получает ERROR/2, даже если generic harness завершился успешно", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "summary.json"), JSON.stringify({
      interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
      config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [] }],
    }))
    const result = await validateNodeRun(directory, ["crosstable-fixed-sum"])
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("incomplete")
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
    await Bun.write(path.join(directory, "summary.json"), JSON.stringify({
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
      await Bun.write(path.join(directory, "summary.json"), JSON.stringify({
        interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
        config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
          { attempt: 1, status: "failed", cleanup_error: null, environment_cleanup: { status: "confirmed" } },
        ] }], ...overrides,
      }))
      expect(await validateNodeRun(directory, ["crosstable-fixed-sum"])).toMatchObject({ verdict: "ERROR", code: 2 })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("failed/timeout/no_artifact — FAIL/1, а generic pass=null не создаёт PASS", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    for (const status of ["failed", "timeout", "no_artifact"]) {
      await Bun.write(path.join(directory, "summary.json"), JSON.stringify({
        interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
        config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
          { attempt: 1, status, pass: null, cleanup_error: null, environment_cleanup: { status: "confirmed" } },
        ] }],
      }))
      expect(await validateNodeRun(directory, ["crosstable-fixed-sum"])).toMatchObject({ verdict: "FAIL", code: 1 })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("completed без подтверждённого cleanup получает ERROR/2", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "summary.json"), JSON.stringify({
      interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
      config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
        { attempt: 1, status: "completed", cleanup_error: null, environment_cleanup: { status: "not_run" } },
      ] }],
    }))
    const result = await validateNodeRun(directory, ["crosstable-fixed-sum"])
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("cleanup")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("infra_error при полном наборе попыток получает ERROR/2 и сохраняет исходный infra retry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-evals-"))
  try {
    await Bun.write(path.join(directory, "summary.json"), JSON.stringify({
      interrupted: false, stopped_reason: null, task_ids: ["crosstable-fixed-sum"],
      config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [
        { attempt: 1, status: "infra_error", environment_cleanup: { status: "confirmed" },
          infra_retry: { initial: { status: "infra_error" } } },
      ] }],
    }))
    const result = await validateNodeRun(directory, ["crosstable-fixed-sum"])
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("infra_error")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
