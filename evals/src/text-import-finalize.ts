import path from "node:path"
import { cp, mkdir } from "node:fs/promises"
import { validateTextImportAttempt } from "./text-import"
import { loadTasks } from "./task"

export async function finalizeTextImportCase(taskDir: string, attemptDir: string, collection: string, coldDir?: string) {
  const task = await Bun.file(path.join(taskDir, "task.json")).json() as { id: string; output_mode?: string }
  const verdict = await validateTextImportAttempt(taskDir, attemptDir)
  if (verdict.errors.length || verdict.failures.length) throw Error(`finalization: ${[...verdict.errors, ...verdict.failures].join("; ")}`)
  if (task.output_mode !== "diagnostic") throw Error("finalization: verified cold evidence required")
  if (coldDir) throw Error("finalization: diagnostic does not use positive cold evidence")
  const bytes = await Bun.file(path.join(attemptDir, "events.jsonl")).bytes()
  await mkdir(collection, { recursive: true })
  const target = path.join(collection, task.id)
  await mkdir(target) // Never overwrite a case already admitted to a collection.
  await cp(taskDir, target, { recursive: true, errorOnExist: true, force: false })
  await Bun.write(path.join(target, "provenance.json"), JSON.stringify({ case_id: task.id, outcome: "diagnostic", warm: "PASS", cold: "NOT_APPLICABLE",
    events_sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    admission: "CODE_CHECKS_ONLY; actual model, budgets and stand cleanup require independent operational verification" }, null, 2) + "\n")
  await loadTasks(collection, [task.id])
  return target
}
