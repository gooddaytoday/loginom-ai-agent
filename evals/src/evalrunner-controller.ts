import path from "node:path"
import { lstat, mkdir, readFile, unlink, rmdir } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { durableEvalrunnerJson, evalrunnerHash, type EvalrunnerSeriesManifest } from "./evalrunner-series"

export async function acquireEvalrunnerExecutor(config: { root: string }, input: { issue: string; task: string; series: string }) {
  const directory = path.join(config.root, "operations/series-executor.lock")
  await mkdir(directory, { mode: 0o700 }).catch(() => { throw new EvalFailure("Executor BUSY/BLOCKED; inspect existing controller", 2) })
  const info = await lstat(directory)
  const owner = { kind: "evalrunner-series-executor", ...input, pid: process.pid, uid: process.getuid?.(),
    stat: await readFile(`/proc/${process.pid}/stat`, "utf8"), nonce: crypto.randomUUID() }
  await durableEvalrunnerJson(path.join(directory, "owner.json"), owner)
  const raw = JSON.stringify(owner, null, 2)
  return { owner, release: async () => {
    const current = await lstat(directory)
    if (current.isSymbolicLink() || current.dev !== info.dev || current.ino !== info.ino ||
      await readFile(path.join(directory, "owner.json"), "utf8") !== raw) throw new EvalFailure("Executor owner changed", 2)
    await unlink(path.join(directory, "owner.json")); await rmdir(directory)
  } }
}

export async function acquireEvalrunnerSeriesLease(config: { root: string }, manifest: EvalrunnerSeriesManifest) {
  const directory = path.join(config.root, "operations/stand.lease")
  const owner = { kind: "evalrunner-versioned-series-lease", issue: manifest.issue, scope: manifest.scope, series: manifest.series,
    manifestSha256: evalrunnerHash(JSON.stringify(manifest, null, 2)), nonce: manifest.nonce }
  const raw = JSON.stringify(owner, null, 2)
  const created = await mkdir(directory, { mode: 0o700 }).then(() => true, error => {
    if (error.code === "EEXIST") return false
    throw error
  })
  if (created) await durableEvalrunnerJson(path.join(directory, "owner.json"), owner)
  const info = await lstat(directory)
  if (info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077 ||
    await readFile(path.join(directory, "owner.json"), "utf8") !== raw) throw new EvalFailure("Stand BUSY/BLOCKED; foreign or historical lease retained", 2)
  return { nonce: manifest.nonce, release: async () => {
    const { inspectEvalrunnerSeries } = await import("./evalrunner-series-check")
    const progress = await inspectEvalrunnerSeries({ ...config, results: path.dirname(manifest.series) }, manifest.series)
    if (progress.status !== "COMPLETE" || progress.completed !== (manifest.scope === "full" ? 144 : 1))
      throw new EvalFailure("Series coverage unconfirmed; stand retained", 2)
    const current = await lstat(directory)
    if (current.isSymbolicLink() || current.dev !== info.dev || current.ino !== info.ino ||
      await readFile(path.join(directory, "owner.json"), "utf8") !== raw) throw new EvalFailure("Series stand owner changed", 2)
    await unlink(path.join(directory, "owner.json")); await rmdir(directory)
  } }
}
