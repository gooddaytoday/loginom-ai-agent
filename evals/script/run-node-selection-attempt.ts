export function selectionAttempt(_pins: unknown, taskID: string, _number: number) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(taskID)) throw Error("SELECTION_TASK_INVALID")
}
