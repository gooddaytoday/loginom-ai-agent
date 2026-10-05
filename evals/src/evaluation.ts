import type { Task } from "./task"
import type { RubricSnapshot } from "./report"

export function rubricSnapshot(task: Task): RubricSnapshot {
  return { version: 1, checklist: task.checklist.map((item) => ({
    id: item.id, weight: item.weight, required: item.required,
    requires_result_file: item.requiresResultFile, requires_run: item.requiresRun,
    ...(item.axis === undefined ? {} : { axis: item.axis }),
  })), oracle_applicable: task.oracle !== undefined, oracle_tolerance: task.oracleTolerance }
}
