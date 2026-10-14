import path from "node:path"
import { lstat, mkdtemp } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { EvalFailure } from "./fail"
import { acquireJudgeLease, globalLockRoot, writeLeaseReceipt } from "./lease"
import { loadJudgeEnvironment } from "./slots"
import { rejudge } from "./rejudge"
import { calibrate } from "./calibrate"

export async function runOfflineJudge(config: EvalConfig, lockRoot = globalLockRoot) {
  if (!config.slotsFile || (config.judgeOnly === undefined && !config.calibrate))
    throw new EvalFailure("OFFLINE_JUDGE_MODE", 2)
  const environment = await loadJudgeEnvironment(config.slotsFile)
  if (path.basename(config.judge.command[0] ?? "") === "codex") {
    const auth = path.join(environment.codexHome, "auth.json")
    const info = await lstat(auth).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw new EvalFailure("JUDGE_AUTH_PRIVATE", 2)
    })
    if (!info) throw new EvalFailure(`Нет входа Codex: отсутствует ${auth}. Выполните: codex login`, 2)
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600)
      throw new EvalFailure("JUDGE_AUTH_PRIVATE", 2)
  }
  const directory = await mkdtemp(path.join(environment.stateDir, "judge-command-"))
  const commandId = crypto.randomUUID()
  const journal = path.join(directory, "journal.json")
  const processInventory = path.join(directory, "processes.json")
  const record = { version: 2, kind: "offline-judge-command", commandId, processInventory }
  await writeLeaseReceipt(processInventory, { version: 2, kind: "offline-judge-processes", commandId, processes: [] })
  await writeLeaseReceipt(journal, { ...record, state: "intent" })
  const lease = await acquireJudgeLease({ codexHome: environment.codexHome, journal, commandId, lockRoot })
  const scoped: EvalConfig = { ...config, judge: { ...config.judge,
    processEvidence: { file: processInventory, commandId, assertHeld: lease.assertHeld },
    env: { ...config.judge.env, CODEX_HOME: environment.codexHome } } }
  let released = false
  let runDir: string | null = null
  const recordRunDirectory = async (directory: string) => {
    runDir = directory
    await writeLeaseReceipt(journal, { ...record, state: "running", runDir })
  }
  try {
    const result = scoped.judgeOnly === undefined ? await calibrate(scoped, undefined, recordRunDirectory) : await rejudge(scoped, scoped.judgeOnly, recordRunDirectory)
    runDir = result.runDir
    if (!result.judgeCleanupConfirmed) {
      await writeLeaseReceipt(journal, { ...record, state: "quarantined", runDir: result.runDir })
      return { ...result, code: 1 }
    }
    const proof = path.join(directory, "cleanup.json")
    await writeLeaseReceipt(proof, { version: 2, status: "confirmed", reason: "judge-processes-confirmed",
      key: lease.reservation.key, token: lease.reservation.token, revision: lease.reservation.revision, runDir: result.runDir })
    await lease.release(proof)
    released = true
    await writeLeaseReceipt(journal, { ...record, state: "released", runDir: result.runDir })
    return result
  } catch (error) {
    if (!released) await writeLeaseReceipt(journal, { ...record,
      state: "quarantined", reason: "command-failed", runDir })
    throw error
  } finally { await lease.close() }
}
