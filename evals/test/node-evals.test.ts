import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { assessNodeAttempt, validateNodeAttempt, validateNodeRun } from "../src/node-evals"
import { emptyResult } from "../src/run"
import { evalsRoot } from "../src/config"

test("saved node attempt without summary collects its own native evidence before assessing quality", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-attempt-recovery-"))
  const taskId = "crosstable-min-max", attempt = path.join(root, taskId, "1")
  const slot = { id: "a", profileDir: path.join(root, "profile"), historyDir: path.join(root, "history") }
  const archive = path.join(slot.historyDir, "attempt-1")
  try {
    await mkdir(slot.profileDir, { mode: 0o700 })
    const native = await Bun.file(new URL("fixtures/node-evals/min-max-native.json", import.meta.url)).json() as {
      observations: { operation_id: string; recorded_at: string; node_crosstable: unknown }[]
    }
    await Bun.write(path.join(archive, "runtime/execution-events.jsonl"), native.observations.map(observation => JSON.stringify({
      operation_id: observation.operation_id, recorded_at: observation.recorded_at, phase: "node_observation_completed",
      outcome: { status: "SUCCEEDED", output: { node_crosstable: observation.node_crosstable } },
    })).join("\n"))
    await Bun.write(path.join(attempt, "cleanup.json"), JSON.stringify({ slotId: slot.id, profileDir: slot.profileDir, archive,
      serverEpoch: "a".repeat(64), processes: { status: "confirmed", error: null, capture_complete: true, unknownProcesses: [], observation_mode: "continuous" },
      serverSessions: "confirmed", storageDeletionAllowed: true, nextAdmissionAllowed: true }))
    const result = { ...emptyResult(taskId, 1, false), slot_id: slot.id, status: "completed", judge_status: "skipped",
      environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }
    await Bun.write(path.join(attempt, "result.json"), JSON.stringify(result))
    const xml = await Bun.file(new URL("fixtures/node-evals/min-max.xml", import.meta.url)).text()
    await Bun.write(path.join(attempt, "artifact/unpacked/Unit_0/Unit.xml"), xml.replace('Mapping Source="A_Amount_Min"', 'Mapping Source="A_Amount_Max"'))
    const zip = Bun.spawn(["python3", "-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()",
      path.join(attempt, "artifact/package.lgp"), path.join(attempt, "artifact/unpacked/Unit_0/Unit.xml")])
    expect(await zip.exited).toBe(0)
    const events = await Bun.file(new URL("fixtures/node-evals/min-max-protocol.json", import.meta.url)).json() as unknown[]
    await Bun.write(path.join(attempt, "events.jsonl"), events.map(event => JSON.stringify(event)).join("\n"))
    await Bun.write(path.join(attempt, "artifact/results/eval-lab26-builder-crosstable-min-max-1-crosstable-min-max-1.result.csv"),
      await Bun.file(path.join(evalsRoot, "tasks/node-evals", taskId, "oracle.csv")).text())
    const assessed = await assessNodeAttempt({ runDir: root, taskId, tasksDir: path.join(evalsRoot, "tasks/node-evals"), slot })
    expect(assessed).toMatchObject({ verdict: "FAIL", code: 1, errors: [] })
    expect(assessed.failures.join(" ")).toContain("mapping")
    expect(assessed.failures.join(" ")).not.toContain("mask 12 proof required")
    expect((await Bun.file(path.join(attempt, "native-crosstable.json")).json()).observations).toHaveLength(2)
    expect(await Bun.file(path.join(root, "summary.json")).exists()).toBe(false)
    expect(await Bun.file(path.join(attempt, "result.json")).json()).toEqual(result)
    const cleanup = await Bun.file(path.join(attempt, "cleanup.json")).json()
    await Bun.write(path.join(attempt, "cleanup.json"), JSON.stringify({ ...cleanup, archive: root }))
    expect(await assessNodeAttempt({ runDir: root, taskId, tasksDir: path.join(evalsRoot, "tasks/node-evals"), slot }))
      .toMatchObject({ verdict: "ERROR", code: 2 })
  } finally { await rm(root, { recursive: true, force: true }) }
})

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
    await Bun.write(path.join(path.dirname(file), task.id, String(attempt.attempt), "result.json"), JSON.stringify({
      ...emptyResult(task.id, attempt.attempt, false), ...attempt,
    }))
    if (attempt.environment_cleanup?.status !== "confirmed") continue
    await Bun.write(path.join(path.dirname(file), task.id, String(attempt.attempt), "cleanup.json"), JSON.stringify({
      processes: { status: "confirmed" }, stages: ["processes", "diagnostics", "writer", "ready", "pruning"].map(stage => ({ stage, status: "confirmed" })),
      result: { status: "confirmed", error: null },
    }))
  }
}

async function slotRun() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-v2-evals-"))
  const id = "crosstable-fixed-sum"
  const profile = path.join(directory, "profile")
  const history = path.join(directory, "history")
  const archive = path.join(history, "attempt-1")
  await mkdir(profile, { mode: 0o700 })
  await mkdir(archive, { recursive: true, mode: 0o700 })
  const summary = { config: { repeat: 1, parallel: 1 }, storage_leftovers: [],
    slots: [{ id: "a", profileDir: profile, historyDir: history, liveQualified: true, state: "closed" }],
    tasks: [{ id, attempts: [{ attempt: 1, status: "failed", slot_id: "a", environment_cleanup: { status: "confirmed" } }] }] }
  const cleanup = { processes: { status: "confirmed", error: null, capture_complete: true, unknownProcesses: [], observation_mode: "continuous" },
    archive, closed: [], removed: [], slotId: "a", profileDir: profile, serverEpoch: "a".repeat(64),
    serverSessions: "confirmed", storageDeletionAllowed: true, nextAdmissionAllowed: true }
  await Bun.write(path.join(directory, "summary.json"), JSON.stringify(summary))
  await Bun.write(path.join(directory, "cases", id, "task.json"), JSON.stringify({ id, checklist: [{ id: "crosstable", required: true }] }))
  const evidence = path.join(directory, id, "1/cleanup.json")
  await Bun.write(evidence, JSON.stringify(cleanup))
  await Bun.write(path.join(directory, id, "1/result.json"), JSON.stringify({ ...emptyResult(id, 1, false), ...summary.tasks[0]!.attempts[0] }))
  return { directory, id, summary, cleanup, evidence }
}

test("v2 cleanup with its own confirmed history archive preserves a failed node result", async () => {
  const context = await slotRun()
  try {
    const result = await validateNodeRun(context.directory, [context.id], path.join(context.directory, "cases"))
    expect(result).toMatchObject({ verdict: "FAIL", code: 1, errors: [] })
  } finally { await rm(context.directory, { recursive: true }) }
})

test("the completed node run treats a provider failure as ERROR rather than a quality FAIL", async () => {
  const context = await slotRun()
  try {
    const attempt = { ...emptyResult(context.id, 1, false), status: "failed", failure_kind: "provider", slot_id: "a",
      environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }
    await Bun.write(path.join(context.directory, context.id, "1/result.json"), JSON.stringify(attempt))
    context.summary.tasks[0]!.attempts[0] = attempt
    await Bun.write(path.join(context.directory, "summary.json"), JSON.stringify(context.summary))
    expect(await validateNodeRun(context.directory, [context.id], path.join(context.directory, "cases")))
      .toMatchObject({ verdict: "ERROR", code: 2 })
  } finally { await rm(context.directory, { recursive: true, force: true }) }
})

test.each(["slot-id", "epoch", "foreign-profile", "foreign-archive", "missing-archive", "process-error", "capture-incomplete",
  "unknown-process", "missing-process-inventory", "deferred-observation", "sessions-unknown", "deletion-refused", "admission-refused"] as const)(
  "v2 cleanup rejects %s despite a confirmed summary", async kind => {
    const context = await slotRun()
    try {
      const changes = {
        "slot-id": { slotId: "unknown" },
        epoch: { serverEpoch: "unknown" },
        "foreign-profile": { profileDir: path.join(context.directory, "other") },
        "foreign-archive": { archive: context.directory },
        "missing-archive": { archive: undefined },
        "process-error": { processes: { ...context.cleanup.processes, error: "unconfirmed process" } },
        "capture-incomplete": { processes: { ...context.cleanup.processes, capture_complete: false } },
        "unknown-process": { processes: { ...context.cleanup.processes, unknownProcesses: [{ pid: 123 }] } },
        "missing-process-inventory": { processes: { ...context.cleanup.processes, unknownProcesses: undefined } },
        "deferred-observation": { processes: { ...context.cleanup.processes, observation_mode: "unit_after_exit" } },
        "sessions-unknown": { serverSessions: "unknown" },
        "deletion-refused": { storageDeletionAllowed: false },
        "admission-refused": { nextAdmissionAllowed: false },
      }
      await Bun.write(context.evidence, JSON.stringify({ ...context.cleanup, ...changes[kind] }))
      expect(await validateNodeRun(context.directory, [context.id], path.join(context.directory, "cases")))
        .toMatchObject({ verdict: "ERROR", code: 2 })
    } finally { await rm(context.directory, { recursive: true }) }
  },
)

test("v2 confirmed cleanup still requires the completed node artifact", async () => {
  const context = await slotRun()
  try {
    context.summary.tasks[0]!.attempts[0]!.status = "completed"
    await Bun.write(path.join(context.directory, "summary.json"), JSON.stringify(context.summary))
    await Bun.write(path.join(context.directory, context.id, "1/result.json"), JSON.stringify({
      ...emptyResult(context.id, 1, false), ...context.summary.tasks[0]!.attempts[0],
    }))
    const result = await validateNodeRun(context.directory, [context.id], path.join(context.directory, "cases"))
    expect(result).toMatchObject({ verdict: "FAIL", code: 1, errors: [] })
    expect(result.failures.join(" ")).toContain("missing artifact/package.lgp")
  } finally { await rm(context.directory, { recursive: true }) }
})

test("v2 slots cannot replace their cleanup proof with legacy archive stages", async () => {
  const context = await slotRun()
  try {
    const history = context.cleanup.profileDir + ".history"
    const archive = path.join(history, "other-attempt")
    await mkdir(archive, { recursive: true, mode: 0o700 })
    context.summary.slots[0]!.historyDir = history
    await Bun.write(path.join(context.directory, "summary.json"), JSON.stringify(context.summary))
    await Bun.write(context.evidence, JSON.stringify({ ...context.cleanup, archive: undefined,
      result: { status: "confirmed" }, stages: [{ stage: "profile_history", status: "confirmed", path: archive }] }))
    expect(await validateNodeRun(context.directory, [context.id], path.join(context.directory, "cases")))
      .toMatchObject({ verdict: "ERROR", code: 2 })
  } finally { await rm(context.directory, { recursive: true }) }
})

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

test("node run rejects an unknown slot before accepting failed-attempt evidence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-unknown-slot-"))
  try {
    const id = "crosstable-fixed-sum"
    await writeSummary(path.join(directory, "summary.json"), JSON.stringify({ config: { repeat: 1, parallel: 2 }, storage_leftovers: [],
      slots: [{ id: "a" }, { id: "b" }], tasks: [{ id, attempts: [{ attempt: 1, status: "failed", slot_id: "unknown",
        environment_cleanup: { status: "confirmed" } }] }] }))
    const result = await validateNodeRun(directory, [id], path.join(directory, "cases"))
    expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
    expect(result.errors.join(" ")).toContain("Unknown node evidence slot")
  } finally { await rm(directory, { recursive: true }) }
})

test("node run cannot pick the first ambiguous slot or use a missing parallel table", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-ambiguous-slot-"))
  try {
    const id = "crosstable-fixed-sum"
    for (const slots of [[{ id: "a" }, { id: "a" }], undefined]) {
      await writeSummary(path.join(directory, "summary.json"), JSON.stringify({ config: { repeat: 1, parallel: 2 }, storage_leftovers: [],
        slots, tasks: [{ id, attempts: [{ attempt: 1, status: "failed", slot_id: "a", environment_cleanup: { status: "confirmed" } }] }] }))
      const result = await validateNodeRun(directory, [id], path.join(directory, "cases"))
      expect(result).toMatchObject({ verdict: "ERROR", code: 2 })
      expect(result.errors.join(" ")).toContain("Unknown node evidence slot")
    }
  } finally { await rm(directory, { recursive: true }) }
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
