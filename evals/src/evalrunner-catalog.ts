import path from "node:path"
import { readFile, lstat, realpath, mkdtemp, cp, rm } from "node:fs/promises"
import { EvalFailure } from "./fail"
import { evalrunnerHash } from "./evalrunner-series"
import { agentCommand } from "./cli"
import { loadConfig } from "./config"
import { sandboxCommand } from "./sandbox"
import { superviseProcess } from "./process-supervisor"

export type EvalrunnerCatalog = { path: string; sha256: string }

export async function verifyEvalrunnerCatalog(catalog: EvalrunnerCatalog) {
  if (!path.isAbsolute(catalog.path) || path.resolve(catalog.path) !== catalog.path ||
    await realpath(catalog.path) !== catalog.path || !/^[a-f0-9]{64}$/.test(catalog.sha256)) throw new EvalFailure("Catalog boundary changed", 2)
  const info = await lstat(catalog.path)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o022) throw new EvalFailure("Catalog file unsafe", 2)
  const bytes = await readFile(catalog.path)
  if (evalrunnerHash(bytes) !== catalog.sha256) throw new EvalFailure("Catalog bytes changed", 2)
  const model = JSON.parse(bytes.toString()).openai?.models?.["gpt-6.1-sol"]
  if (model?.id !== "gpt-6.1-sol" || !model.reasoning_options?.some((item: { type: string; values?: string[] }) =>
    item.type === "effort" && item.values?.includes("medium"))) throw new EvalFailure("Catalog target/medium missing", 2)
  return { ...catalog, bytes: bytes.length, model: "openai/gpt-6.1-sol", variant: "medium", fetchDisabled: true }
}

/** Offline only; identical product flags and filesystem boundary, with a separate empty profile. */
export async function qualifyEvalrunnerCatalog(config: { workspace: string; profile: string }, env: Record<string, string>, catalog: EvalrunnerCatalog) {
  const verified = await verifyEvalrunnerCatalog(catalog)
  const root = await mkdtemp(path.join(config.workspace, ".catalog-probe-"))
  const { mkdir } = await import("node:fs/promises")
  await mkdir(path.join(root, "profile"), { mode: 0o700 }); await mkdir(path.join(root, "workspace"), { mode: 0o700 })
  await cp(path.join(config.profile, "cli-profile.json"), path.join(root, "profile/cli-profile.json"))
  const effective = { ...env, EVAL_PROFILE_DIR: path.join(root, "profile") }
  const command = agentCommand(loadConfig(["--skip-judge"], effective), effective)
  const cmd = [...command.cmd, "models", "openai"]
  const boundary = await sandboxCommand({ cmd, profileDir: effective.EVAL_PROFILE_DIR, workdir: path.join(root, "workspace"), env: command.env })
  const result = await superviseProcess({ cmd, cwd: boundary.cwd, env: boundary.env, sandbox: boundary.cmd,
    profileDir: effective.EVAL_PROFILE_DIR, timeoutMs: 600_000 })
  const { writeFile } = await import("node:fs/promises")
  await writeFile(path.join(root, "probe-result.private.json"), JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 })
  if (result.exitCode !== 0 || result.timedOut || result.sandboxError || result.interrupted || result.processCleanup.status !== "confirmed" ||
    !result.stdout.split(/\r?\n/).includes("openai/gpt-6.1-sol")) throw new EvalFailure(`Catalog sandbox recognition/cleanup unconfirmed (exit ${result.exitCode}, cleanup ${result.processCleanup.status}, ${result.processCleanup.error ?? result.sandboxError ?? "output"}); preserve probe`, 2)
  await verifyEvalrunnerCatalog(catalog)
  await rm(root, { recursive: true })
  return { ...verified, recognition: "confirmed", sandbox: "confirmed", cleanup: "confirmed", productInferenceCalls: 0, judgeCalls: 0 }
}
