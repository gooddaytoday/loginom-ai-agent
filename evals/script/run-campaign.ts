import path from "node:path"
import { constants } from "node:fs"
import { mkdir, open, readdir, rename, stat } from "node:fs/promises"
import { parseArgs } from "node:util"
import { isQualityResult, type AttemptResult } from "../src/report"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"

type CampaignKey = { corpus: string; taskId: string; round: number }
export type CampaignManifest = {
  id: string; server: string; executor: string; parallel: number; batchSize: number
  keys: CampaignKey[]; pins: Record<string, string | number>; issueId?: string; wakeupIds?: string[]
  limits?: { consecutiveErrors?: number; maxStartedAttempts?: number; noProgressMs?: number }
}
type Batch = { id: string; keys: CampaignKey[]; resultsDir: string; invocationBefore: string; started: boolean; accounted?: boolean; startedAttempts?: number }
type AccountedAttempt = {
  key: CampaignKey; resultFile: string; status: string; counted: boolean; pass: boolean | null; score: number | null; cleanupConfirmed: boolean
  resources?: { status: string; codes: string[] }
  completedAt?: number
}
export type CampaignJournal = {
  manifestHash: string; server: string; campaignId: string; executor: string; repairing: boolean; repairer: string | null
  batches: Batch[]; attempts: AccountedAttempt[]; lastProgressAt: number; consecutiveErrors: number; emptyPreflights?: number
  blocker?: string; final?: "full" | "partial"; published?: boolean; reportCommentId?: string; attachmentId?: string; cleanupVerified?: boolean
  blockerKind?: "technical" | "external" | "delivery"; blockerCommentId?: string; startedAttempts?: number
  verificationAttempted?: boolean
  reportingError?: string
}
type UnitState = { active: boolean; invocation: string; exitCode: number }
const keyId = (key: CampaignKey) => `${key.corpus}/${key.taskId}/${key.round}`

export function campaignLimits(manifest: CampaignManifest) {
  const limits = { consecutiveErrors: manifest.limits?.consecutiveErrors ?? 3,
    maxStartedAttempts: manifest.limits?.maxStartedAttempts ?? manifest.keys.length + Math.ceil(0.2 * manifest.keys.length),
    noProgressMs: manifest.limits?.noProgressMs ?? 24 * 3600000 }
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1)) throw Error("CAMPAIGN_LIMITS_INVALID")
  return limits
}

export function campaignEnvironment(manifest: CampaignManifest, config: { slotsFile: string; resourceBudgetFile: string }): Record<string, string> {
  if (manifest.pins.EVAL_CLI_MODE !== "binary" ||
    ["EVAL_CLI_BIN", "EVAL_AGENT_MODEL", "EVAL_AGENT_VARIANT", "JUDGE_MODEL", "JUDGE_REASONING"]
      .some(key => typeof manifest.pins[key] !== "string" || !String(manifest.pins[key]).trim()))
    throw Error("CAMPAIGN_EXPERIMENT_PINS_REQUIRED")
  return { ...Object.fromEntries(Object.entries(manifest.pins).map(([key, value]) => [key, String(value)])),
    EVAL_SLOTS_FILE: config.slotsFile, EVAL_RESOURCE_BUDGET_FILE: config.resourceBudgetFile }
}

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

async function finishCampaignIssue(manifest: CampaignManifest, journal: CampaignJournal, config: PublisherConfig) {
  const endpoint = `/api/issues/${config.multica.issueId}`
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

export async function syncCampaignIssue(manifest: CampaignManifest, journal: CampaignJournal, config: PublisherConfig): Promise<boolean> {
  if (journal.published) return true
  const endpoint = `/api/issues/${config.multica.issueId}`
  const comments = await campaignRequest(config, `${endpoint}/comments`) as { id: string; content: string; revision: number }[]
  const marker = `<!-- eval-campaign:${manifest.id} -->`
  const existing = comments.find(comment => comment.content.includes(marker) &&
    (/^<!-- eval-final:(full|partial) -->$/m.test(comment.content) || /^# (полный|частичный:.*)$/m.test(comment.content)))
  if (existing) {
    journal.final = /^<!-- eval-final:partial -->$/m.test(existing.content) || /^# частичный:/m.test(existing.content) ? "partial" : "full"
    journal.reportCommentId = existing.id
    await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
    await finishCampaignIssue(manifest, journal, config)
    return true
  }
  if (journal.final) return false
  const blockerMarker = `<!-- eval-blocker:${manifest.id} -->`
  const blocker = comments.find(comment => comment.content.includes(blockerMarker))
  if (!journal.blocker && !blocker) return false
  const content = `${blockerMarker}\n${journal.blocker ? `Блокер (${journal.blockerKind ?? "technical"}): ${journal.blocker}` : "Блокер устранён; кампания продолжает выполнение."}`
  if (blocker?.content !== content) {
    const preview = await campaignRequest(config, `${endpoint}/comments/trigger-preview`, "POST", { content,
      ...(blocker ? { editing_comment_id: blocker.id } : {}) }) as { agents: { id: string }[] }
    const saved = await campaignRequest(config, blocker ? `/api/comments/${blocker.id}` : `${endpoint}/comments`, blocker ? "PUT" : "POST", {
      content, suppress_agent_ids: preview.agents.map(agent => agent.id),
      ...(blocker ? { content_base: blocker.content, expected_revision: blocker.revision } : {}),
    }) as { id: string }
    const persisted = await campaignRequest(config, `${endpoint}/comments`) as { id: string; content: string }[]
    if (!saved.id || !persisted.some(comment => comment.id === saved.id && comment.content === content)) throw Error("CAMPAIGN_BLOCKER_READBACK")
    journal.blockerCommentId = saved.id
  } else journal.blockerCommentId = blocker.id
  await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
  const issue = await campaignRequest(config, endpoint) as { revision: number; status: string }
  const status = journal.blocker && (journal.blockerKind ?? "technical") === "technical" ? "blocked" : "in_progress"
  if (issue.status !== status) {
    await campaignRequest(config, endpoint, "PUT", { status, expected_revision: issue.revision, suppress_run: true })
    if ((await campaignRequest(config, endpoint) as { status: string }).status !== status) throw Error("CAMPAIGN_BLOCKER_READBACK")
  }
  return false
}

export async function publishCampaign(manifest: CampaignManifest, journal: CampaignJournal, config: PublisherConfig) {
  if (journal.published) return
  if (!journal.final) throw Error("CAMPAIGN_NOT_FINAL")
  if (await syncCampaignIssue(manifest, journal, config)) return
  if (journal.final === "full" && !journal.cleanupVerified) throw Error("CAMPAIGN_CLEANUP_UNCONFIRMED")
  const marker = `<!-- eval-campaign:${manifest.id} -->`
  const report = [marker, `<!-- eval-final:${journal.final} -->`, `# ${journal.final === "full" ? "полный" : `частичный: ${journal.blocker ?? "предел кампании"}`}`, "",
    `Кампания ${manifest.id}; сервер ${journal.server}.`, "",
    `Очистка кампании: ${journal.cleanupVerified ? "подтверждена" : "не подтверждена"} (globalcleanupConfirmed=${journal.cleanupVerified === true}).`,
    ...(journal.final === "partial" ? ["Частичный итог по последним известным данным. Непроверенные ресурсы остаются неподтверждёнными."] : []), "",
    ...manifest.keys.map(key => {
      const attempt = journal.attempts.find(item => item.counted && keyId(item.key) === keyId(key))
      return `- ${keyId(key)}: ${attempt ? `${attempt.pass ? "PASS" : "FAIL"}; cleanup=${attempt.cleanupConfirmed ? "подтверждён" : "не подтверждён"}; ресурсы=${attempt.resources?.status ?? "incomplete"}; ${attempt.resources?.codes.join(", ") ?? "RESOURCE_EVIDENCE_MISSING"}` : "не измерено"}`
    }), "", `Учтено ${journal.attempts.filter(item => item.counted).length}/${manifest.keys.length}.`, ""].join("\n")
  await Bun.write(path.join(config.stateDir, "report.md"), report)
  const endpoint = `/api/issues/${config.multica.issueId}`
  const digest = (bytes: ArrayBuffer | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
  const archive = path.join(config.stateDir, `${manifest.id}-${digest(report)}.tar.gz`)
  delete journal.attachmentId
  if (!(await Bun.file(archive).exists())) {
    await writeLeaseReceipt(path.join(config.stateDir, "manifest.json"), manifest)
    await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
    const directories = await readdir(config.stateDir)
    const files = ["manifest.json", "journal.json", "report.md", ...["batches", "verification"].filter(name => directories.includes(name))]
    const temporary = `${archive}.${crypto.randomUUID()}.tmp`
    await command(["tar", "--exclude=*.secret.json", "-czf", temporary, ...files], config.stateDir)
    await rename(temporary, archive)
  }
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
  await finishCampaignIssue(manifest, journal, config)
}

export async function finalizeCampaign(manifest: CampaignManifest, journal: CampaignJournal,
  config: PublisherConfig & { harnessRoot: string; verifyCommand: string[] }, now = Date.now()) {
  const synced = await syncCampaignIssue(manifest, journal, config).catch(() => undefined)
  if (synced === undefined) journal.reportingError = "MULTICA_UNAVAILABLE"
  if (synced !== undefined) delete journal.reportingError
  if (synced) return journal
  if (journal.final !== "partial" && now - journal.lastProgressAt >= campaignLimits(manifest).noProgressMs) {
    journal.final = "partial"
    journal.blocker = `NO_PROGRESS_LIMIT${journal.blocker ? `:${journal.blocker}` : ""}`
  }
  if (!journal.final) return journal
  if (!journal.cleanupVerified && !journal.verificationAttempted) {
    journal.verificationAttempted = true
    await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
    const verified = await command(config.verifyCommand.map(value => value.replaceAll("{stateDir}", config.stateDir)
      .replaceAll("{parallel}", String(manifest.parallel))), config.harnessRoot).then(() => true, () => false)
    if (verified) journal.cleanupVerified = true
    if (!verified) {
      journal.blocker = journal.final === "partial" ? journal.blocker ?? "CLEANUP_UNCONFIRMED" : "CLEANUP_UNCONFIRMED"
      journal.blockerKind = "technical"
    }
    await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
  }
  if (journal.final === "full" && !journal.cleanupVerified) {
    delete journal.final
    journal.blocker = "CLEANUP_UNCONFIRMED"
    journal.blockerKind = "technical"
    await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
    return journal
  }
  if (synced === undefined) {
    await writeLeaseReceipt(path.join(config.stateDir, "journal.json"), journal)
    return journal
  }
  await publishCampaign(manifest, journal, config)
  return journal
}

export async function prepareCampaignBatch(manifest: CampaignManifest, journal: CampaignJournal, keys: CampaignKey[], invocation: string,
  config: Pick<CampaignServerConfig, "harnessRoot" | "slotsFile" | "batchEnvFile" | "resourceBudgetFile" | "corpora"> & { stateDir: string }) {
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
  const entrypoint = path.resolve(config.harnessRoot, corpus.entrypoint), tasks = path.resolve(config.harnessRoot, corpus.tasks)
  if ([entrypoint, tasks].some(file => !file.startsWith(config.harnessRoot + path.sep))) throw Error("CAMPAIGN_CORPUS_PATH")
  const environment = { ...campaignEnvironment(manifest, config), EVAL_ENTRYPOINT: entrypoint, EVAL_TASKS: tasks,
    EVAL_ONLY: batch.keys.map(key => key.taskId).join(","), EVAL_LABEL: batch.id, EVAL_RESULTS_DIR: batch.resultsDir,
    EVAL_CAMPAIGN_CONSECUTIVE_ERRORS: journal.consecutiveErrors, EVAL_CAMPAIGN_ERROR_LIMIT: campaignLimits(manifest).consecutiveErrors,
    EVAL_CAMPAIGN_LAST_PROGRESS_AT: journal.lastProgressAt, EVAL_CAMPAIGN_NO_PROGRESS_MS: campaignLimits(manifest).noProgressMs }
  const temporary = `${config.batchEnvFile}.${crypto.randomUUID()}.tmp`
  await Bun.write(temporary, Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join("\n") + "\n", { mode: 0o600 })
  await rename(temporary, config.batchEnvFile)
  return batch
}

export async function campaignTick(manifest: CampaignManifest, previous: CampaignJournal, unit: UnitState | undefined, now = Date.now()) {
  const journal: CampaignJournal = structuredClone(previous)
  if (journal.campaignId !== manifest.id || journal.server !== manifest.server) throw Error("CAMPAIGN_OWNERSHIP_MISMATCH")
  if (!unit) {
    journal.blocker ??= "BATCH_STATE_UNKNOWN"
    if (journal.final === "partial" || now - journal.lastProgressAt >= campaignLimits(manifest).noProgressMs) {
      journal.final = "partial"
      return { journal, action: "finalize" as const, next: [] }
    }
    if (journal.final === "full" && journal.cleanupVerified) return { journal, action: "finalize" as const, next: [] }
    delete journal.final
    return { journal, action: "blocked" as const, next: [] }
  }
  if (journal.blocker === "BATCH_STATE_UNKNOWN") { delete journal.blocker; delete journal.blockerKind }
  if (journal.final) {
    if (!journal.published && now - journal.lastProgressAt >= campaignLimits(manifest).noProgressMs) {
      journal.final = "partial"
      journal.blocker ??= "NO_PROGRESS_LIMIT"
    }
    return { journal, action: "finalize" as const, next: [] }
  }
  const batch = journal.batches.at(-1)
  let pending: CampaignKey[] | undefined
  if (unit.active) {
    if (!batch || batch.accounted) {
      journal.blocker = "UNOWNED_BATCH_ACTIVE"
      if (now - journal.lastProgressAt >= campaignLimits(manifest).noProgressMs) {
        journal.final = "partial"
        return { journal, action: "finalize" as const, next: [] }
      }
      return { journal, action: "blocked" as const, next: [] }
    }
    return { journal, action: "wait" as const, next: [] }
  }
  const completed: { entry: AccountedAttempt; order?: number }[] = []
  try {
    if (batch && !batch.accounted) {
      const runs = await readdir(batch.resultsDir).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return []
        throw error
      })
      let startedAttempts = 0, admissionConfirmed = true
      const completions = new Map<string, { completedAt?: number; completionOrder?: number; quality?: boolean }>()
      for (const run of runs) {
        const runDir = path.join(batch.resultsDir, run)
        try {
          const saved = await Bun.file(path.join(runDir, "config.json")).json() as { commandJournal?: string }
          if (typeof saved.commandJournal !== "string" || !path.isAbsolute(saved.commandJournal)) throw Error("ADMISSION_STATE_UNCONFIRMED")
          const native = await readLeaseReceipt(saved.commandJournal) as { version: number; kind: string; runDir: string;
            attempts?: { taskId: string; attempt: number; purpose: string; completedAt?: number; completionOrder?: number; quality?: boolean }[]; admissionBlocker?: string }
          if (native.version !== 2 || native.kind !== "unactivated-preparation" || native.runDir !== runDir || !Array.isArray(native.attempts) ||
            native.attempts.some(attempt => !["preflight", "measurement"].includes(attempt.purpose) || attempt.attempt !== 1 ||
              attempt.purpose === "measurement" && !batch.keys.some(key => key.taskId === attempt.taskId))) throw Error("ADMISSION_STATE_UNCONFIRMED")
          startedAttempts += native.attempts.filter(attempt => attempt.purpose === "measurement").length
          for (const attempt of native.attempts.filter(attempt => attempt.purpose === "measurement"))
            completions.set(path.join(runDir, attempt.taskId, "1/result.json"), attempt)
          if (native.admissionBlocker) journal.blocker ??= native.admissionBlocker
        } catch { admissionConfirmed = false; journal.blocker ??= "ADMISSION_STATE_UNCONFIRMED" }
      }
      if (admissionConfirmed) {
        if (startedAttempts < (batch.startedAttempts ?? 0)) journal.blocker ??= "ADMISSION_STATE_UNCONFIRMED"
        else batch.startedAttempts = startedAttempts
      }
      const totalStarted = journal.batches.reduce((total, item) => total + (item.startedAttempts ?? 0), 0)
      if (totalStarted < (journal.startedAttempts ?? 0)) journal.blocker ??= "ADMISSION_STATE_UNCONFIRMED"
      else journal.startedAttempts = totalStarted
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
          const counted = resources.status !== "failed" && isQualityResult(result)
          const completion = completions.get(resultFile)
          const completedAt = Math.min(now, completion?.quality === counted && Number.isSafeInteger(completion.completedAt)
            ? completion.completedAt! : (await stat(resultFile)).mtimeMs)
          const entry = { key, resultFile, status: result.status, counted, pass: result.pass, score: result.score, resources,
            completedAt,
            cleanupConfirmed: result.environment_cleanup?.status === "confirmed" && cleanup?.processes?.status === "confirmed" && cleanup?.nextAdmissionAllowed === true }
          const index = journal.attempts.findIndex(attempt => attempt.resultFile === resultFile)
          if (index >= 0) journal.attempts[index] = entry
          if (index < 0) {
            journal.attempts.push(entry)
            completed.push({ entry, order: completion?.completionOrder })
          }
        }
      }
      if (!batch.started && unit.invocation === batch.invocationBefore && !probes.some(probe => probe) &&
        !journal.attempts.some(attempt => attempt.resultFile.startsWith(batch.resultsDir + path.sep)))
        pending = batch.keys
      if (!pending) batch.accounted = true
      if (probes.some(probe => probe?.code === null)) journal.emptyPreflights = 0
      if (!pending && !batch.keys.every(key => journal.attempts.some(attempt => attempt.resultFile.startsWith(batch.resultsDir + path.sep) && keyId(attempt.key) === keyId(key)))) {
        const failure = probes.find(probe => probe && ["REQUEST_PREFLIGHT_EMPTY", "REQUEST_PREFLIGHT_FAILED"].includes(probe.code ?? ""))
        if (failure && !journal.attempts.some(attempt => attempt.resultFile.startsWith(batch.resultsDir + path.sep))) {
          journal.consecutiveErrors++
          journal.emptyPreflights = failure.code === "REQUEST_PREFLIGHT_EMPTY" ? (journal.emptyPreflights ?? 0) + 1 : 0
          if (journal.emptyPreflights >= 3 || journal.consecutiveErrors >= (manifest.limits?.consecutiveErrors ?? 3)) journal.blocker = failure.code!
        } else journal.blocker ??= "BATCH_RESULT_MISSING"
      }
    }
  } catch {
    journal.blocker = "CAMPAIGN_RECONCILIATION_FAILED"
    journal.blockerKind = "technical"
  }
  completed.sort((a, b) => a.entry.completedAt! - b.entry.completedAt! || (a.order ?? 0) - (b.order ?? 0))
  for (const { entry } of completed) {
    journal.consecutiveErrors = entry.counted ? 0 : journal.consecutiveErrors + 1
    if (entry.counted) journal.lastProgressAt = Math.max(journal.lastProgressAt, entry.completedAt!)
    if (journal.consecutiveErrors >= campaignLimits(manifest).consecutiveErrors) journal.blocker ??= "CONSECUTIVE_INFRASTRUCTURE_ERRORS"
  }
  if (journal.blocker?.startsWith("NO_PROGRESS_LIMIT") || now - journal.lastProgressAt >= campaignLimits(manifest).noProgressMs) {
    journal.final = "partial"
    if (!journal.blocker?.startsWith("NO_PROGRESS_LIMIT")) journal.blocker = `NO_PROGRESS_LIMIT${journal.blocker ? `:${journal.blocker}` : ""}`
    return { journal, action: "finalize" as const, next: [] }
  }
  const missing = manifest.keys.filter(key => !journal.attempts.some(attempt => attempt.counted && keyId(attempt.key) === keyId(key)))
  if (missing.length && (journal.startedAttempts ?? 0) >= campaignLimits(manifest).maxStartedAttempts) {
    journal.final = "partial"
    journal.blocker = "ATTEMPT_BUDGET_EXHAUSTED"
    return { journal, action: "finalize" as const, next: [] }
  }
  if (journal.attempts.some(attempt => !attempt.cleanupConfirmed) && !journal.cleanupVerified) journal.blocker ??= "CLEANUP_UNCONFIRMED"
  if (journal.repairing || journal.blocker) return { journal, action: "blocked" as const, next: [] }
  if (pending) return { journal, action: "launch" as const, next: pending }
  if (!missing.length) {
    journal.final = "full"
    return { journal, action: "finalize" as const, next: [] }
  }
  const first = missing[0]!
  const next = missing.filter(key => key.corpus === first.corpus && key.round === first.round)
    .slice(0, Math.min(manifest.batchSize, campaignLimits(manifest).maxStartedAttempts - (journal.startedAttempts ?? 0)))
  return { journal, action: "start" as const, next }
}

export type CampaignServerConfig = {
  server: string; stateRoot: string; harnessRoot: string; controllerLock: string; batchUnit: string; batchEnvFile: string
  acceptedHarness: string; slotsFile: string; experimentPinsFile: string; corpusPinsFile: string
  resourceBudgetFile: string; preflightCommand: string[]; verifyCommand: string[]
  corpora: Record<string, { entrypoint: string; tasks: string }>
  multica: { url: string; workspace: string; tokenFile: string }
}

async function command(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (code !== 0) {
    if (stderr.trim()) console.error(stderr.trim())
    throw Error(`CAMPAIGN_COMMAND_FAILED:${path.basename(args[0]!)}:${code}`)
  }
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
    Object.entries(manifest.pins).some(([key, value]) => !/^[A-Z][A-Z0-9_]*$/.test(key) || /PASSWORD|TOKEN|SECRET|API_KEY/.test(key) || !["string", "number"].includes(typeof value)))
    throw Error("CAMPAIGN_MANIFEST_INVALID")
  campaignLimits(manifest)
  if (![config.stateRoot, config.harnessRoot, config.controllerLock, config.batchEnvFile, config.resourceBudgetFile,
    config.slotsFile, config.experimentPinsFile, config.corpusPinsFile].every(value => typeof value === "string" && path.isAbsolute(value)) ||
    !/^[a-f0-9]{40}$/.test(config.acceptedHarness) ||
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
      const exists = await Bun.file(journalFile).exists()
      const previous: CampaignJournal = exists ? await readLeaseReceipt(journalFile) as CampaignJournal : {
        manifestHash, server: config.server, campaignId: manifest.id, executor: manifest.executor, repairing: false, repairer: null,
        batches: [], attempts: [], lastProgressAt: Date.now(), consecutiveErrors: 0,
      }
      if (previous.manifestHash !== manifestHash) throw Error("CAMPAIGN_MANIFEST_CHANGED")
      if (previous.published) return previous
      if (!exists) await writeLeaseReceipt(journalFile, previous)
      const unit = await observeUnit(unitName, config.harnessRoot).catch(() => undefined)
      const tick = await campaignTick(manifest, previous, unit)
      await writeLeaseReceipt(journalFile, tick.journal)
      if (tick.action !== "wait") {
        const synced = await syncCampaignIssue(manifest, tick.journal, publication).then(final => ({ final }), () => null)
        if (synced?.final) return tick.journal
        if (!synced) tick.journal.reportingError = "MULTICA_UNAVAILABLE"
        if (synced) {
          delete tick.journal.reportingError
          if (tick.action === "start" || tick.action === "launch") {
            try {
              const first = tick.next[0]!
              await command([...config.preflightCommand, "--server", serverFile, "--manifest", manifestFile,
                first.corpus, tick.next.map(key => key.taskId).join(","), String(first.round), String(manifest.parallel)], config.harnessRoot)
              const batch = await prepareCampaignBatch(manifest, tick.journal, tick.next, unit!.invocation, { ...config, stateDir })
              await command(["sudo", "-n", "systemctl", "start", unitName], config.harnessRoot)
              batch.started = true
            } catch {
              tick.journal.blocker = "CAMPAIGN_EXECUTION_FAILED"
              tick.journal.blockerKind = "technical"
              await syncCampaignIssue(manifest, tick.journal, publication).catch(() => { tick.journal.reportingError = "MULTICA_UNAVAILABLE" })
            }
          }
        }
        if (tick.action === "finalize") {
          await (unit ? finalizeCampaign(manifest, tick.journal, { ...publication, harnessRoot: config.harnessRoot, verifyCommand: config.verifyCommand })
            : publishCampaign(manifest, tick.journal, publication)).catch(() => { tick.journal.reportingError = "FINAL_DELIVERY_FAILED" })
          if (!tick.journal.published) await syncCampaignIssue(manifest, tick.journal, publication)
            .catch(() => { tick.journal.reportingError = "MULTICA_UNAVAILABLE" })
        }
        await writeLeaseReceipt(journalFile, tick.journal)
        if (tick.journal.published) return tick.journal
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
