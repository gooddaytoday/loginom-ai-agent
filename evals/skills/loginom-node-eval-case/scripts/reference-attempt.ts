import path from "node:path"
import { chmod, mkdir, writeFile } from "node:fs/promises"
import type { Task } from "../../../src/task"

async function main() {
  const [draft, number, hint, ...extra] = process.argv.slice(2)
  if (!draft || !/^[1-3]$/.test(number ?? "") || extra.length)
    throw Error("usage: bun reference-attempt.ts <draft> <1|2|3> [hint-file]")
  for (const key of ["AGENT_REPO", "EVAL_CLI_MODE", "EVAL_AGENT_MODEL", "EVAL_AGENT_VARIANT", "EVAL_PROFILE_DIR", "EVAL_WORKSPACE_ROOT", "EVAL_RESULTS_DIR", "EVAL_TASK_TIMEOUT_MS"])
    if (!process.env[key]) throw Error(`${key} required`)
  if (!["binary", "fake"].includes(process.env.EVAL_CLI_MODE!)) throw Error("binary CLI required; fake is for fixtures only")
  const repo = path.resolve(process.env.AGENT_REPO!)
  const { loadConfig } = await import(path.join(repo, "evals/src/config.ts")) as typeof import("../../../src/config")
  const { agentCommand } = await import(path.join(repo, "evals/src/cli.ts")) as typeof import("../../../src/cli")
  const { runAttempt, afterAttempt, installSigint, redact } = await import(path.join(repo, "evals/src/run.ts")) as typeof import("../../../src/run")
  const { parseArtifactSource } = await import(path.join(repo, "evals/src/artifact.ts")) as typeof import("../../../src/artifact")
  const { preflight } = await import(path.join(repo, "evals/src/preflight.ts")) as typeof import("../../../src/preflight")
  const { acquireHarnessLease } = await import(path.join(repo, "evals/src/lease.ts")) as typeof import("../../../src/lease")
  const { assertAuth, assertProfileClean } = await import(path.join(repo, "evals/src/profile.ts")) as typeof import("../../../src/profile")
  const dir = path.resolve(draft)
  const raw = await Bun.file(path.join(dir, "task.json")).json()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(raw.id) || raw.id !== path.basename(dir) || typeof raw.prompt !== "string" || !raw.prompt.trim())
    throw Error("draft requires matching id and nonempty prompt")
  if (!Array.isArray(raw.inputs) || !raw.inputs.every((file: unknown) => typeof file === "string" && !path.isAbsolute(file) && !file.split(/[\\/]/).includes("..")))
    throw Error("draft inputs must be relative files within the case")
  if (new Set(raw.inputs.map((file: string) => path.basename(file))).size !== raw.inputs.length)
    throw Error("input basenames must be unique")
  // The complete loader requires reference.lgp before dispatch. Builder has no judge/rubric;
  // finalization must separately load the completed collection through loadTasks.
  const task: Task = { id: raw.id, dir, title: raw.title, prompt: raw.prompt,
    inputs: raw.inputs, reference: raw.reference, spec: raw.spec, checklist: [],
    expectedOutput: raw.expected_output, timeoutMs: raw.timeout_ms,
    oracle: await Bun.file(path.join(dir, "oracle.csv")).exists() ? "oracle.csv" : undefined,
    oracleTolerance: raw.oracle_tolerance ?? 0.01 }
  if (hint) task.prompt += `\n\n${await Bun.file(hint).text()}`
  const config = loadConfig(["--skip-judge", "--repeat", "1", "--timeout-ms", process.env.EVAL_TASK_TIMEOUT_MS!], process.env)
  const runId = `reference-${task.id}-${number}`
  await mkdir(config.resultsDir, { recursive: true, mode: 0o700 })
  const runDir = path.join(config.resultsDir, runId)
  await mkdir(runDir, { mode: 0o700 }) // Never overwrite or silently retry an author attempt.
  const sources = [...new Set([...task.inputs, ...await Array.fromAsync(
    new Bun.Glob("**/*").scan({ cwd: dir, onlyFiles: true, dot: true, followSymlinks: false }))])]
  const hashes = Object.fromEntries(await Promise.all(sources.map(async file => [file,
    new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(dir, file)).bytes()).digest("hex")])))
  await Bun.write(path.join(runDir, "source-hashes.json"), JSON.stringify(hashes, null, 2) + "\n")
  if (hint) await Bun.write(path.join(runDir, "hint.txt"), await Bun.file(hint).text())
  await Bun.write(path.join(runDir, "config.json"), JSON.stringify(redact(config), null, 2) + "\n")
  const lease = await acquireHarnessLease(config.profileDir)
  config.profileDir = lease.profileDir
  const command = { ...agentCommand(config, { ...process.env, AGENT_REPO: undefined }),
    cleanupDir: path.join(runDir, "preparation"),
    cleanupSecrets: [config.loginom.password, config.dock.apiKey, config.agent.provider?.apiKey ?? ""] }
  await assertProfileClean(config.profileDir)
  const settingsFile = path.join(config.profileDir, "config/loginom-ai-agent.json")
  // The product loads JSONC after JSON; do not silently leave an overriding policy active.
  if (await Bun.file(path.join(config.profileDir, "config/loginom-ai-agent.jsonc")).exists())
    throw Error("reference profile requires canonical loginom-ai-agent.json; JSONC overlay is unsupported")
  const settings = await Bun.file(settingsFile).exists() ? await Bun.file(settingsFile).json() : {}
  const inherited = Object.entries(typeof settings.permission === "string" ? { "*": settings.permission } : settings.permission ?? {})
  const denied = ["loginom_remember", "loginom_write", "loginom_edit", "loginom_add_resource", "loginom_forget"]
  settings.permission = {
    ...Object.fromEntries(inherited.filter(([key]) => !key.startsWith("loginom_"))),
    "loginom_*": "allow",
    ...Object.fromEntries(inherited.filter(([key]) => key.startsWith("loginom_") && key !== "loginom_*" && !denied.includes(key))),
    ...Object.fromEntries(denied.map(key => [key, "deny"])),
  }
  await mkdir(path.dirname(settingsFile), { recursive: true, mode: 0o700 })
  if (await Bun.file(settingsFile).exists()) await chmod(settingsFile, 0o600)
  await writeFile(settingsFile, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 })
  await assertAuth(config, command)
  const source = parseArtifactSource(config.artifactSource, config.loginom)
  const environment = await preflight(config, source)
  await Bun.write(path.join(runDir, "environment.json"), JSON.stringify(environment, null, 2) + "\n")
  const controller = new AbortController()
  installSigint(controller)
  const attempt = await runAttempt({ config, command, source, task, attempt: Number(number), runId, runDir,
    signal: controller.signal, profileRecovered: false, skipJudge: true })
  const out = path.join(runDir, task.id, number!)
  const cleanup = await afterAttempt(config, { ...command, cleanupDir: path.join(out, "management") }, attempt.result, out)
  const clean = attempt.result.environment_cleanup?.status === "confirmed" && !attempt.result.cleanup_error && !("stop" in cleanup)
  if (clean && task.id === "crosstable-min-max" && attempt.result.status === "completed") {
    const { collectNodeNativeEvidence } = await import(path.join(repo, "evals/src/node-native.ts")) as typeof import("../../../src/node-native")
    await collectNodeNativeEvidence(out, config.profileDir)
  }
  const unchanged = (await Promise.all(Object.entries(hashes).map(async ([file, hash]) =>
    new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(dir, file)).bytes()).digest("hex") === hash))).every(Boolean)
  const report = { run_dir: runDir, attempt_dir: out, result: attempt.result, stop: attempt.stop,
    source_unchanged: unchanged, requested_model: config.agent.model, requested_variant: config.agent.variant }
  await Bun.write(path.join(runDir, "builder-result.json"), JSON.stringify(report, null, 2) + "\n")
  if (clean) await lease.release()
  console.log(JSON.stringify(report))
  process.exitCode = !clean || attempt.stop || !unchanged ? 2 : attempt.result.status === "completed" ? 0 : 1
}

if (import.meta.main) await main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : String(error)
  for (const key of ["LOGINOM_PASSWORD", "LOGINOM_DOCK_API_KEY", "EVAL_AGENT_PROVIDER_API_KEY"])
    if (process.env[key]) message = message.replaceAll(process.env[key]!, "[redacted]")
  console.error(message)
  process.exitCode = 2
})
