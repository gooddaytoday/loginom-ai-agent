import type { Task } from "./task"
import type { RunSummary, RubricSnapshot } from "./report"

export function rubricSnapshot(task: Task): RubricSnapshot {
  return { version: 1, checklist: task.checklist.map((item) => ({
    id: item.id, weight: item.weight, required: item.required,
    requires_result_file: item.requiresResultFile, requires_run: item.requiresRun,
    ...(item.axis === undefined ? {} : { axis: item.axis }),
  })), oracle_applicable: task.oracle !== undefined, oracle_tolerance: task.oracleTolerance }
}

export function evaluationContractHash(input: { rubric_hash: string; judge: RunSummary["judge"]; pass_threshold: number }) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify({
    version: 1, rubric_hash: input.rubric_hash,
    judge: input.judge ? {
      backend: input.judge.backend, codex_version: input.judge.codex_version,
      model: input.judge.model, reasoning: input.judge.reasoning,
      prompt_sha256: input.judge.prompt_sha256, schema_sha256: input.judge.schema_sha256,
    } : null,
    pass_threshold: input.pass_threshold,
  })).digest("hex")
}

export function sameRubricSnapshot(a?: RubricSnapshot, b?: RubricSnapshot) {
  return snapshotIdentity(a) === snapshotIdentity(b)
}
function snapshotIdentity(snapshot?: RubricSnapshot) {
  return snapshot === undefined ? null : JSON.stringify({
    version: snapshot.version, oracle_applicable: snapshot.oracle_applicable, oracle_tolerance: snapshot.oracle_tolerance,
    checklist: snapshot.checklist.map((item) => ({
      id: item.id, weight: item.weight, required: item.required, requires_result_file: item.requires_result_file,
      requires_run: item.requires_run, axis: item.axis,
    })).toSorted((a,b) => a.id.localeCompare(b.id)),
  })
}
