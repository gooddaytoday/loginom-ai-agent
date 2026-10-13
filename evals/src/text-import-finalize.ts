import path from "node:path"
import { cp, mkdir } from "node:fs/promises"
import { validateTextImportAttempt } from "./text-import"
import { loadTasks } from "./task"
import { validateTextImportCold } from "./text-import-cold"

export async function finalizeTextImportCase(taskDir: string, attemptDir: string, collection: string, coldDir?: string) {
  const task = await Bun.file(path.join(taskDir, "task.json")).json() as { id: string; output_mode?: string }
  const verdict = await validateTextImportAttempt(taskDir, attemptDir)
  if (verdict.errors.length || verdict.failures.length) throw Error(`finalization: ${[...verdict.errors, ...verdict.failures].join("; ")}`)
  const diagnostic = task.output_mode === "diagnostic"
  if (!diagnostic && !coldDir) throw Error("finalization: verified cold evidence required")
  if (diagnostic && coldDir) throw Error("finalization: diagnostic does not use positive cold evidence")
  if (coldDir) {
    const checked = await validateTextImportCold(taskDir, attemptDir, coldDir)
    if (checked.errors.length || checked.failures.length) throw Error(`finalization cold: ${[...checked.errors, ...checked.failures].join("; ")}`)
  }
  const bytes = await Bun.file(path.join(attemptDir, "events.jsonl")).bytes()
  await mkdir(collection, { recursive: true })
  const target = path.join(collection, task.id)
  await mkdir(target) // Never overwrite a case already admitted to a collection.
  await cp(taskDir, target, { recursive: true, errorOnExist: true, force: false })
  const reference = diagnostic ? undefined : await Bun.file(path.join(attemptDir, "artifact/package.lgp")).bytes()
  if (reference) await Bun.write(path.join(target, "reference.lgp"), reference)
  await Bun.write(path.join(target, "provenance.json"), JSON.stringify({ case_id: task.id, outcome: diagnostic ? "diagnostic" : "positive", warm: "PASS", cold: diagnostic ? "NOT_APPLICABLE" : "PASS",
    events_sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    ...(reference ? { reference_sha256: new Bun.CryptoHasher("sha256").update(reference).digest("hex") } : {}),
    ...(coldDir ? { cold_report_sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(coldDir, "result.json")).bytes()).digest("hex") } : {}),
    admission: "CODE_CHECKS_ONLY; actual model, budgets and stand cleanup require independent operational verification" }, null, 2) + "\n")
  await loadTasks(collection, [task.id])
  return target
}
