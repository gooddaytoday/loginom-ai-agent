import path from "node:path"
import { mkdir, realpath } from "node:fs/promises"
import { parseArgs } from "node:util"
import { evalsRoot, loadConfig } from "../src/config"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { loadTasks, agentInputsHash, rubricHash, taskTimeoutMs } from "../src/task"
import { loadSlots } from "../src/slots"
import { readServerIdentity } from "../src/parallel-pair"
import { requireResourceBudgetScopes, validResourceBound } from "../src/parallel-resource-budget"
import { campaignEnvironment } from "./run-campaign"
import type { CampaignManifest, CampaignServerConfig } from "./run-campaign"

function requirePin(expected: unknown, actual: string, name: string) {
  if (typeof expected !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(expected) || actual !== expected)
    throw Error(`${name}_PIN_CHANGED`)
}

async function command(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, stdout: "pipe", stderr: "ignore" })
  const output = await new Response(child.stdout).text()
  if (await child.exited !== 0) throw Error("PREFLIGHT_COMMAND_FAILED")
  return output.trim()
}

export async function campaignPreflight(manifestFile: string, serverFile: string, args: string[]) {
  const server = await readLeaseReceipt(serverFile) as CampaignServerConfig
  const manifest = await readLeaseReceipt(manifestFile) as CampaignManifest
  const root = await realpath(server.harnessRoot)
  if (root !== await realpath(evalsRoot) || root !== await realpath(process.cwd())) throw Error("PREFLIGHT_HARNESS_ROOT")
  const ids = args[1]?.split(",") ?? []
  const round = Number(args[2]), parallel = Number(args[3])
  if (args.length !== 4 || !ids.length || ids.length > manifest.batchSize || new Set(ids).size !== ids.length ||
    !Number.isSafeInteger(round) || round < 1 || parallel !== manifest.parallel ||
    ids.some(id => !manifest.keys.some(key => key.corpus === args[0] && key.taskId === id && key.round === round)))
    throw Error("SELECTION_INVALID")
  const env = { ...process.env, ...campaignEnvironment(manifest, server) }
  const pins = await readLeaseReceipt(server.experimentPinsFile) as {
    sourceSha: string; cli: string; cliBinarySha256: string; public_models_sha256: string
  }
  const corpus = await readLeaseReceipt(server.corpusPinsFile) as {
    sourceSha: string; groups: { group: string; dir: string; tasks: {
      id: string; agentInputsHash: string; rubricHash: string; timeoutMs: number
    }[] }[]
  }
  requirePin(server.acceptedHarness, await command(["git", "rev-parse", "HEAD"], root), "HARNESS")
  requirePin(pins.sourceSha, corpus.sourceSha, "CORPUS_SOURCE")
  if (await command(["git", "status", "--porcelain", "--untracked-files=normal"], root)) throw Error("SOURCE_TREE_DIRTY")
  const group = corpus.groups.find(group => group.group === args[0])
  const selected = server.corpora[args[0]!]
  if (!group || !selected || ids.some(id => !group.tasks.some(task => task.id === id))) throw Error("SELECTION_INVALID")
  const tasksDir = path.resolve(root, selected.tasks)
  if (!tasksDir.startsWith(root + path.sep) || tasksDir !== path.resolve(root, group.dir)) throw Error("CAMPAIGN_CORPUS_PATH")
  const config = loadConfig(["--tasks", tasksDir, "--only", ids.join(","), "--parallel", String(parallel), "--repeat", "1"], env)
  if (config.agent.cliMode !== "binary" || config.agent.cliBin !== pins.cli) throw Error("CLI_PATH_CHANGED")
  if (config.agent.model !== manifest.pins.EVAL_AGENT_MODEL || config.agent.variant !== manifest.pins.EVAL_AGENT_VARIANT ||
    config.judge.model !== manifest.pins.JUDGE_MODEL || config.judge.reasoning !== manifest.pins.JUDGE_REASONING)
    throw Error("CAMPAIGN_EXPERIMENT_PINS_CHANGED")
  requirePin(pins.cliBinarySha256, new Bun.CryptoHasher("sha256").update(await Bun.file(pins.cli).bytes()).digest("hex"), "BINARY")
  const units = await command(["systemctl", "list-units", "--all", "--plain", "--no-legend",
    server.batchUnit.replace("{parallel}", "*"), "loginom-evals-judge-*.service"], root)
  if (units.split("\n").some(line => ["active", "activating", "deactivating", "reloading"].includes(line.trim().split(/\s+/)[2]!)))
    throw Error("EVAL_UNITS_BUSY")
  const tasks = await loadTasks(tasksDir, ids)
  const taskHashes = await Promise.all(tasks.map(async task => {
    const pinned = group.tasks.find(candidate => candidate.id === task.id)!
    const inputs = await agentInputsHash([task]), rubric = await rubricHash([task])
    requirePin(pinned.agentInputsHash, inputs, "TASK_INPUTS")
    requirePin(pinned.rubricHash, rubric, "TASK_RUBRIC")
    if (taskTimeoutMs(config, task) !== pinned.timeoutMs) throw Error("TASK_TIMEOUT_CHANGED")
    return { id: task.id, agentInputsHash: inputs, rubricHash: rubric, timeoutMs: pinned.timeoutMs }
  }))
  const slots = await loadSlots(server.slotsFile, parallel)
  const identity = await readServerIdentity(slots)
  const budgetBytes = await Bun.file(server.resourceBudgetFile).bytes()
  const bounds: unknown = JSON.parse(new TextDecoder().decode(budgetBytes))
  if (!Array.isArray(bounds) || !bounds.length || !bounds.every(validResourceBound)) throw Error("RESOURCE_BUDGET_INVALID")
  requireResourceBudgetScopes(bounds, {
    paths: [slots.controller.stateDir, ...slots.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])],
    containers: [{ role: "server", id: identity.containerId, startedAt: identity.startedAt },
      { role: "studio", id: identity.studioContainerId, startedAt: identity.studioStartedAt }],
  })
  const memory = await Bun.file("/proc/meminfo").text()
  const memoryAvailable = Number(memory.match(/^MemAvailable:\s+(\d+) kB$/m)?.[1]) * 1024
  const swapFree = Number(memory.match(/^SwapFree:\s+(\d+) kB$/m)?.[1]) * 1024
  if (!(memoryAvailable >= 3 * 1024 ** 3) || !(swapFree >= 3 * 1024 ** 3)) throw Error("RESOURCE_RESERVE_LOW")
  const auth = await Promise.all(slots.slots.map(async slot => {
    const record = await Bun.file(`${slot.profileDir}/data/auth.json`).json() as { openai?: { type?: string; expires?: number } }
    const remainingMs = (record.openai?.expires ?? NaN) - Date.now()
    if (record.openai?.type !== "oauth" || !Number.isFinite(remainingMs) || remainingMs < 8.25 * 3600000) throw Error("OAUTH_WINDOW_TOO_SHORT")
    requirePin(pins.public_models_sha256, new Bun.CryptoHasher("sha256")
      .update(await Bun.file(`${slot.profileDir}/cache/models.json`).bytes()).digest("hex"), "MODEL_CATALOGUE")
    return { slot: slot.id, remainingMs, safeUntil: new Date(record.openai.expires! - 15 * 60000).toISOString() }
  }))
  const record = { ready: true, observedAt: new Date().toISOString(), selection: { corpus: args[0], ids, round, parallel },
    sourceSha: pins.sourceSha, harnessSha: server.acceptedHarness, cliBinarySha256: pins.cliBinarySha256,
    agent: { model: config.agent.model, variant: config.agent.variant }, judge: { model: config.judge.model, reasoning: config.judge.reasoning },
    taskHashes, identity, auth, memoryAvailable, swapFree, resourceBudgetFile: server.resourceBudgetFile,
    resourceBudgetSha256: new Bun.CryptoHasher("sha256").update(budgetBytes).digest("hex") }
  const evidence = path.join(server.stateRoot, manifest.id, `preflight-${crypto.randomUUID()}.json`)
  await mkdir(path.dirname(evidence), { recursive: true, mode: 0o700 })
  await writeLeaseReceipt(evidence, record)
  return { ...record, evidence }
}

if (import.meta.main) {
  try {
    const args = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, options: { manifest: { type: "string" }, server: { type: "string" } } })
    if (!args.values.manifest || !args.values.server) throw Error("PREFLIGHT_ARGUMENTS")
    console.log(JSON.stringify(await campaignPreflight(args.values.manifest, args.values.server, args.positionals)))
  } catch (error) {
    console.error(JSON.stringify({ ready: false, error: error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "PREFLIGHT_FAILED" }))
    process.exitCode = 2
  }
}
