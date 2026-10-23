import path from "node:path"
import { constants } from "node:fs"
import { mkdir, open, readdir, rename } from "node:fs/promises"
import { parseArgs } from "node:util"
import type { AttemptResult } from "../src/report"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"

type CampaignKey = { corpus: string; taskId: string; round: number }
export type CampaignManifest = {
  id: string; server: string; executor: string; parallel: number; batchSize: number
  keys: CampaignKey[]; pins: Record<string, string | number>; issueId?: string; wakeupIds?: string[]
  limits?: { consecutiveErrors?: number }
}
type Batch = { id: string; keys: CampaignKey[]; resultsDir: string; invocationBefore: string; started: boolean; accounted?: boolean }
type AccountedAttempt = {
  key: CampaignKey; resultFile: string; status: string; counted: boolean; pass: boolean | null; score: number | null; cleanupConfirmed: boolean
  resources?: { status: string; codes: string[] }
}
export type CampaignJournal = {
  manifestHash: string; server: string; campaignId: string; executor: string; repairing: boolean; repairer: string | null
  batches: Batch[]; attempts: AccountedAttempt[]; lastProgressAt: number; consecutiveErrors: number; emptyPreflights?: number
  blocker?: string; final?: "full" | "partial"; published?: boolean; reportCommentId?: string; attachmentId?: string; cleanupVerified?: boolean
}
type UnitState = { active: boolean; invocation: string; exitCode: number }
const keyId = (key: CampaignKey) => `${key.corpus}/${key.taskId}/${key.round}`

type PublisherConfig = { stateDir: string; multica: { url: string; workspace: string; issueId: string; tokenFile: string } }
async function campaignFetch(config: PublisherConfig, endpoint: string, method = "GET", body?: object | FormData) {
  const token = (await Bun.file(config.multica.tokenFile).text()).trim()
  const url = new URL(endpoint, config.multica.url)
  url.searchParams.set("workspace_slug", config.multica.workspace)
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw Error(`MULTICA_${response.status}`)
  return response
}
async function campaignRequest(config: PublisherConfig, endpoint: string, method = "GET", body?: object | FormData): Promise<unknown> {
  const response = await campaignFetch(config, endpoint, method, body)
  return response.status === 204 ? null : response.json()
}

export async function publishCampaign(manifest: CampaignManifest, journal: CampaignJournal, config: PublisherConfig) {
  if (journal.published) return
  if (!journal.final) throw Error("CAMPAIGN_NOT_FINAL")
  const marker = `<!-- eval-campaign:${manifest.id} -->`
  const report = [marker, `# ${journal.final === "full" ? "полный" : `частичный: ${journal.blocker ?? "предел кампании"}`}`, "",
    `Кампания ${manifest.id}; сервер ${journal.server}.`, "",
    ...manifest.keys.map(key => {
      const attempt = journal.attempts.find(item => item.counted && keyId(item.key) === keyId(key))
      return `- ${keyId(key)}: ${attempt ? `${attempt.pass ? "PASS" : "FAIL"}; cleanup=${attempt.cleanupConfirmed ? "подтверждён" : "не подтверждён"}; ресурсы=${attempt.resources?.status ?? "incomplete"}; ${attempt.resources?.codes.join(", ") ?? "RESOURCE_EVIDENCE_MISSING"}` : "не измерено"}`
    }), "", `Учтено ${journal.attempts.filter(item => item.counted).length}/${manifest.keys.length}.`, ""].join("\n")
  await Bun.write(path.join(config.stateDir, "report.md"), report)
  const endpoint = `/api/issues/${config.multica.issueId}`
  const archive = path.join(config.stateDir, `${manifest.id}.tar.gz`)
  if (!(await Bun.file(archive).exists())) {
    await writeLeaseReceipt(path.join(config.stateDir, "manifest.json"), manifest)
    await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
    const directories = await readdir(config.stateDir)
    const files = ["manifest.json", "journal.json", "report.md", ...["batches", "verification"].filter(name => directories.includes(name))]
    await command(["tar", "--exclude=*.secret.json", "-czf", archive, ...files], config.stateDir)
  }
  const digest = (bytes: ArrayBuffer) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
  const archiveHash = digest(await Bun.file(archive).arrayBuffer())
  const attachments = await campaignRequest(config, `${endpoint}/attachments`) as { id: string; filename: string }[]
  const matching = attachments.filter(item => item.filename === path.basename(archive))
  for (const attachment of matching) {
    if (digest(await (await campaignFetch(config, `/api/attachments/${attachment.id}/download`)).arrayBuffer()) === archiveHash)
      journal.attachmentId = attachment.id
  }
  if (!journal.attachmentId) {
    const form = new FormData()
    form.set("issue_id", config.multica.issueId)
    form.set("file", Bun.file(archive), path.basename(archive))
    const uploaded = await campaignRequest(config, "/api/upload-file", "POST", form) as { id: string }
    if (!uploaded.id) throw Error("CAMPAIGN_ATTACHMENT_NOT_PERSISTED")
    journal.attachmentId = uploaded.id
    await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
  }
  if (digest(await (await campaignFetch(config, `/api/attachments/${journal.attachmentId}/download`)).arrayBuffer()) !== archiveHash)
    throw Error("CAMPAIGN_ATTACHMENT_READBACK")
  const comments = await campaignRequest(config, `${endpoint}/comments`) as { id: string; content: string }[]
  const existing = comments.find(comment => comment.content.includes(marker))
  const preview = existing ? { agents: [] } : await campaignRequest(config, `${endpoint}/comments/trigger-preview`, "POST", { content: report }) as { agents: { id: string }[] }
  const comment = existing ?? await campaignRequest(config, `${endpoint}/comments`, "POST", { content: report,
    attachment_ids: [journal.attachmentId], suppress_agent_ids: preview.agents.map(agent => agent.id) }) as { id: string }
  if (!comment.id) throw Error("CAMPAIGN_REPORT_NOT_PERSISTED")
  journal.reportCommentId = comment.id
  await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
  const persisted = await campaignRequest(config, `${endpoint}/comments`) as { id: string; content: string }[]
  if (!persisted.some(item => item.id === comment.id && item.content === report)) throw Error("CAMPAIGN_REPORT_READBACK")
  const issue = await campaignRequest(config, endpoint) as { revision: number; status: string }
  if (issue.status !== "in_review") await campaignRequest(config, endpoint, "PUT", { status: "in_review", expected_revision: issue.revision, suppress_run: true })
  const rules = await campaignRequest(config, `${endpoint}/wakeups`) as { id: string; enabled: boolean }[]
  for (const rule of rules.filter(rule => rule.enabled && manifest.wakeupIds?.includes(rule.id)))
    await campaignRequest(config, `${endpoint}/wakeups/${rule.id}/disable`, "POST", {})
  const finalIssue = await campaignRequest(config, endpoint) as { status: string }
  const finalRules = await campaignRequest(config, `${endpoint}/wakeups`) as { id: string; enabled: boolean }[]
  if (finalIssue.status !== "in_review" || manifest.wakeupIds?.some(id => !finalRules.some(rule => rule.id === id && !rule.enabled)))
    throw Error("CAMPAIGN_FINAL_READBACK")
  journal.published = true
  await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
}

export async function prepareCampaignBatch(manifest: CampaignManifest, journal: CampaignJournal, keys: CampaignKey[], invocation: string,
  config: { stateDir: string; batchEnvFile: string; resourceBudgetFile: string; corpora: Record<string, { entrypoint: string; tasks: string }> }) {
  if (journal.repairing || journal.final || journal.blocker || journal.executor !== manifest.executor) throw Error("CAMPAIGN_DISPATCH_BLOCKED")
  const previous = journal.batches.at(-1)
  const batch = previous && !previous.accounted ? previous : {
    id: `${manifest.id}-${crypto.randomUUID()}`, keys, invocationBefore: invocation, started: false,
    resultsDir: path.join(config.stateDir, "batches", String(journal.batches.length + 1)),
  }
  if (batch !== previous) journal.batches.push(batch)
  await mkdir(batch.resultsDir, { recursive: true, mode: 0o700 })
  await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
  const corpus = config.corpora[batch.keys[0]!.corpus]
  if (!corpus) throw Error("CAMPAIGN_CORPUS_UNKNOWN")
  const environment = { ...manifest.pins, EVAL_ENTRYPOINT: corpus.entrypoint, EVAL_TASKS: corpus.tasks,
    EVAL_ONLY: batch.keys.map(key => key.taskId).join(","), EVAL_LABEL: batch.id, EVAL_RESULTS_DIR: batch.resultsDir,
    EVAL_RESOURCE_BUDGET_FILE: config.resourceBudgetFile }
  const temporary = `${config.batchEnvFile}.${crypto.randomUUID()}.tmp`
  await Bun.write(temporary, Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join("\n") + "\n", { mode: 0o600 })
  await rename(temporary, config.batchEnvFile)
  return batch
}

export async function campaignTick(manifest: CampaignManifest, previous: CampaignJournal, unit: UnitState, now = Date.now()) {
  const journal: CampaignJournal = structuredClone(previous)
  if (journal.campaignId !== manifest.id || journal.server !== manifest.server) throw Error("CAMPAIGN_OWNERSHIP_MISMATCH")
  if (journal.final) return { journal, action: "finalize" as const, next: [] }
  const batch = journal.batches.at(-1)
  if (unit.active) {
    if (!batch || batch.accounted) {
      journal.blocker = "UNOWNED_BATCH_ACTIVE"
      return { journal, action: "blocked" as const, next: [] }
    }
    return { journal, action: "wait" as const, next: [] }
  }
  if (batch && !batch.accounted) {
    const runs = await readdir(batch.resultsDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    })
    const probes = await Promise.all(runs.map(async run => {
      const file = Bun.file(path.join(batch.resultsDir, run, "request-preflight.json"))
      return await file.exists() ? file.json() as Promise<{ code: string | null }> : null
    }))
    for (const key of batch.keys) {
      for (const run of runs) {
        const resultFile = path.join(batch.resultsDir, run, key.taskId, "1/result.json")
        if (!(await Bun.file(resultFile).exists())) continue
        const result = await Bun.file(resultFile).json() as AttemptResult
        if (result.task_id !== key.taskId || result.attempt !== 1) throw Error("CAMPAIGN_RESULT_IDENTITY")
        const cleanup = await Bun.file(path.join(path.dirname(resultFile), "cleanup.json")).json().catch(() => null)
        const acceptance = await Bun.file(path.join(batch.resultsDir, run, "resource-acceptance.json")).json().catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null
          throw error
        }) as { checks: { status: string; codes: string[] }[] } | null
        if (acceptance && (!Array.isArray(acceptance.checks) || acceptance.checks.some(check => !["passed", "failed", "incomplete"].includes(check.status) ||
          !Array.isArray(check.codes) || check.codes.some(code => typeof code !== "string")))) throw Error("CAMPAIGN_RESOURCE_EVIDENCE_INVALID")
        const resources = acceptance ? {
          status: acceptance.checks.some(check => check.status === "failed") ? "failed" : acceptance.checks.some(check => check.status === "incomplete") || !acceptance.checks.length ? "incomplete" : "passed",
          codes: acceptance.checks.flatMap(check => check.codes),
        } : { status: "incomplete", codes: ["RESOURCE_EVIDENCE_MISSING"] }
        const counted = resources.status !== "failed" && !["infra_error", "harness_error", "interrupted"].includes(result.status) &&
          result.failure_kind !== "provider" && !result.harness_error && typeof result.pass === "boolean" &&
          ["scored", "no_artifact"].includes(result.judge_status)
        const entry = { key, resultFile, status: result.status, counted, pass: result.pass, score: result.score, resources,
          cleanupConfirmed: result.environment_cleanup?.status === "confirmed" && cleanup?.processes?.status === "confirmed" && cleanup?.nextAdmissionAllowed === true }
        const index = journal.attempts.findIndex(attempt => attempt.resultFile === resultFile)
        if (index >= 0) journal.attempts[index] = entry
        if (index < 0) {
          journal.attempts.push(entry)
          journal.consecutiveErrors = counted ? 0 : journal.consecutiveErrors + 1
          if (counted) journal.lastProgressAt = now
        }
      }
    }
    if (!batch.started && unit.invocation === batch.invocationBefore && !probes.some(probe => probe) &&
      !journal.attempts.some(attempt => attempt.resultFile.startsWith(batch.resultsDir + path.sep)))
      return { journal, action: "launch" as const, next: batch.keys }
    batch.accounted = true
    if (probes.some(probe => probe?.code === null)) journal.emptyPreflights = 0
    if (!batch.keys.every(key => journal.attempts.some(attempt => attempt.resultFile.startsWith(batch.resultsDir + path.sep) && keyId(attempt.key) === keyId(key)))) {
      const failure = probes.find(probe => probe && ["REQUEST_PREFLIGHT_EMPTY", "REQUEST_PREFLIGHT_FAILED"].includes(probe.code ?? ""))
      if (failure && !journal.attempts.some(attempt => attempt.resultFile.startsWith(batch.resultsDir + path.sep))) {
        journal.consecutiveErrors++
        journal.emptyPreflights = failure.code === "REQUEST_PREFLIGHT_EMPTY" ? (journal.emptyPreflights ?? 0) + 1 : 0
        if (journal.emptyPreflights >= 3 || journal.consecutiveErrors >= (manifest.limits?.consecutiveErrors ?? 3)) journal.blocker = failure.code!
      } else journal.blocker = "BATCH_RESULT_MISSING"
    }
  }
  if (journal.attempts.some(attempt => !attempt.cleanupConfirmed)) journal.blocker = "CLEANUP_UNCONFIRMED"
  if (journal.repairing || journal.blocker) return { journal, action: "blocked" as const, next: [] }
  const missing = manifest.keys.filter(key => !journal.attempts.some(attempt => attempt.counted && keyId(attempt.key) === keyId(key)))
  if (!missing.length) {
    journal.final = "full"
    return { journal, action: "finalize" as const, next: [] }
  }
  const first = missing[0]!
  const next = missing.filter(key => key.corpus === first.corpus && key.round === first.round).slice(0, manifest.batchSize)
  return { journal, action: "start" as const, next }
}

type CampaignServerConfig = {
  server: string; stateRoot: string; harnessRoot: string; controllerLock: string; batchUnit: string; batchEnvFile: string
  resourceBudgetFile: string; preflightCommand: string[]; verifyCommand: string[]
  corpora: Record<string, { entrypoint: string; tasks: string }>
  multica: { url: string; workspace: string; tokenFile: string }
}

async function command(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (code !== 0) throw Error(`CAMPAIGN_COMMAND_FAILED:${path.basename(args[0]!)}:${code}`)
  return stdout
}

async function observeUnit(unit: string, cwd: string): Promise<UnitState> {
  const text = await command(["systemctl", "show", unit, "--property=ActiveState,InvocationID,ExecMainStatus"], cwd)
  const fields = Object.fromEntries(text.trim().split("\n").map(line => line.split("=")))
  if (!fields.ActiveState) throw Error("BATCH_STATE_UNKNOWN")
  return { active: ["active", "activating", "deactivating", "reloading"].includes(fields.ActiveState),
    invocation: fields.InvocationID ?? "", exitCode: Number(fields.ExecMainStatus) }
}

async function controllerLock(file: string) {
  const { dlopen } = await import("bun:ffi")
  const library = dlopen("libc.so.6", { flock: { args: ["i32", "i32"], returns: "i32" } })
  const handle = await open(file, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)
  if (library.symbols.flock(handle.fd, 2 | 4) !== 0) { await handle.close(); library.close(); throw Error("CAMPAIGN_BUSY") }
  return async () => { await handle.close(); library.close() }
}

export async function runCampaign(manifestFile: string, serverFile: string, once = false) {
  const manifest = await readLeaseReceipt(manifestFile) as CampaignManifest
  const config = await readLeaseReceipt(serverFile) as CampaignServerConfig
  const safeId = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value)
  if (!safeId(manifest.id) || manifest.server !== config.server || !manifest.executor || !manifest.keys?.length ||
    !Number.isSafeInteger(manifest.parallel) || manifest.parallel < 1 || !Number.isSafeInteger(manifest.batchSize) || manifest.batchSize < 1 ||
    manifest.keys.some(key => !safeId(key.corpus) || !safeId(key.taskId) || !Number.isSafeInteger(key.round) || key.round < 1) ||
    new Set(manifest.keys.map(keyId)).size !== manifest.keys.length ||
    manifest.limits?.consecutiveErrors !== undefined && (!Number.isSafeInteger(manifest.limits.consecutiveErrors) || manifest.limits.consecutiveErrors < 1) ||
    Object.entries(manifest.pins).some(([key, value]) => !/^[A-Z][A-Z0-9_]*$/.test(key) || /PASSWORD|TOKEN|SECRET|API_KEY/.test(key) || !["string", "number"].includes(typeof value)))
    throw Error("CAMPAIGN_MANIFEST_INVALID")
  if (![config.stateRoot, config.harnessRoot, config.controllerLock, config.batchEnvFile, config.resourceBudgetFile].every(value => typeof value === "string" && path.isAbsolute(value)) ||
    !config.batchUnit || !manifest.issueId || !Array.isArray(manifest.wakeupIds) || manifest.wakeupIds.some(id => typeof id !== "string" || !id) ||
    !config.preflightCommand?.length || !config.verifyCommand?.length)
    throw Error("CAMPAIGN_SERVER_INVALID")
  const stateDir = path.join(config.stateRoot, manifest.id)
  await mkdir(stateDir, { recursive: true, mode: 0o700 })
  const journalFile = path.join(stateDir, "journal.json")
  const manifestHash = new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex")
  const unitName = config.batchUnit.replace("{parallel}", String(manifest.parallel))
  const publication = { stateDir, multica: { ...config.multica, issueId: manifest.issueId } }
  do {
    const unlock = await controllerLock(config.controllerLock)
    try {
      const previous = await Bun.file(journalFile).exists() ? await readLeaseReceipt(journalFile) as CampaignJournal : {
        manifestHash, server: config.server, campaignId: manifest.id, executor: manifest.executor, repairing: false, repairer: null,
        batches: [], attempts: [], lastProgressAt: Date.now(), consecutiveErrors: 0,
      }
      if (previous.manifestHash !== manifestHash) throw Error("CAMPAIGN_MANIFEST_CHANGED")
      if (previous.published) return previous
      const unit = await observeUnit(unitName, config.harnessRoot)
      const tick = await campaignTick(manifest, previous, unit)
      await writeLeaseReceipt(journalFile, tick.journal)
      if (tick.action === "start" || tick.action === "launch") {
        const first = tick.next[0]!
        await command([...config.preflightCommand, first.corpus, tick.next.map(key => key.taskId).join(","), String(first.round), String(manifest.parallel)], config.harnessRoot)
        const batch = await prepareCampaignBatch(manifest, tick.journal, tick.next, unit.invocation, { ...config, stateDir })
        await command(["sudo", "-n", "systemctl", "start", unitName], config.harnessRoot)
        batch.started = true
        await writeLeaseReceipt(journalFile, tick.journal)
      }
      if (tick.action === "finalize") {
        if (!tick.journal.cleanupVerified) {
          await command(config.verifyCommand.map(arg => arg.replaceAll("{stateDir}", stateDir)), config.harnessRoot)
          tick.journal.cleanupVerified = true
          await writeLeaseReceipt(journalFile, tick.journal)
        }
        await publishCampaign(manifest, tick.journal, publication)
        return tick.journal
      }
      if (once) return tick.journal
    } finally { await unlock() }
    await Bun.sleep(10_000)
  } while (true)
}

if (import.meta.main) {
  const args = parseArgs({ args: Bun.argv.slice(2), options: { manifest: { type: "string" }, server: { type: "string" }, once: { type: "boolean" } } }).values
  if (!args.manifest || !args.server) throw Error("usage: bun script/run-campaign.ts --manifest /private/manifest.json --server /private/server.json [--once]")
  await runCampaign(args.manifest, args.server, args.once).catch(error => { console.error(error instanceof Error ? error.message : "CAMPAIGN_FAILED"); process.exitCode = 2 })
}
