import path from "node:path"
import { mkdir } from "node:fs/promises"
import { parseArgs, parseEnv } from "node:util"
import { tryCampaignLock } from "../src/campaign-lock"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { campaignEnvironment, campaignLimits, type CampaignManifest, type CampaignServerConfig } from "./run-campaign"

export type CampaignRequest = Omit<CampaignManifest, "id" | "server" | "wakeupIds" | "issueId"> & { issueId: string }
type LaunchConfig = CampaignServerConfig & { launch: {
  campaignUnit: string; prepareCommand: string[]; verifyCommand: string[]
  controllerCommand?: string[]; serviceCommand?: string[]; environmentFile?: string
} }
type Wakeup = { id: string; instruction: string; agent_id: string; enabled: boolean }

// The installed server config is trusted operator configuration, outside the evaluated agent's mounts.
export async function launchCampaign(request: CampaignRequest, serverFile: string) {
  const config = await readLeaseReceipt(serverFile) as LaunchConfig
  if (!/^[a-f0-9-]{36}$/.test(request.issueId) || !request.executor ||
    !Number.isSafeInteger(request.parallel) || request.parallel < 1 ||
    !Number.isSafeInteger(request.batchSize) || request.batchSize < 1 || !request.keys?.length ||
    request.keys.some(key => !/^[a-zA-Z0-9_-]+$/.test(key.corpus) || !/^[a-zA-Z0-9_-]+$/.test(key.taskId) || !Number.isSafeInteger(key.round) || key.round < 1) ||
    new Set(request.keys.map(key => JSON.stringify(key))).size !== request.keys.length ||
    !request.pins || Object.entries(request.pins).some(([key, value]) => !/^[A-Z][A-Z0-9_]*$/.test(key) ||
      /PASSWORD|TOKEN|SECRET|API_KEY/.test(key) || !["string", "number"].includes(typeof value))) throw Error("CAMPAIGN_REQUEST_INVALID")
  campaignLimits({ ...request, id: "check", server: config.server })
  campaignEnvironment({ ...request, id: "check", server: config.server }, config)
  if (!path.isAbsolute(config.stateRoot) || !path.isAbsolute(config.harnessRoot) ||
    !/^[a-zA-Z0-9_.@{}-]+\.service$/.test(config.launch?.campaignUnit ?? "") ||
    !config.launch.campaignUnit.includes("{campaign}") || !config.launch.prepareCommand?.includes("{outputDir}") ||
    !config.launch.verifyCommand?.includes("{outputDir}")) throw Error("CAMPAIGN_LAUNCH_UNCONFIGURED")
  const campaignId = `issue-${request.issueId}`
  const stateDir = path.join(config.stateRoot, campaignId)
  await mkdir(stateDir, { recursive: true, mode: 0o700 })
  const unlock = await tryCampaignLock(path.join(stateDir, "launch.lock"))
  if (!unlock) throw Error("CAMPAIGN_LAUNCH_BUSY")
  const api = async (endpoint: string, method = "GET", body?: object): Promise<unknown> => {
    const token = (await Bun.file(config.multica.tokenFile).text()).trim()
    const url = new URL(endpoint, config.multica.url)
    url.searchParams.set("workspace_slug", config.multica.workspace)
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw Error(`MULTICA_${response.status}`)
    return response.status === 204 ? null : response.json()
  }
  const endpoint = `/api/issues/${request.issueId}`
  try {
    const savedRequest = path.join(stateDir, "request.json")
    if (await Bun.file(savedRequest).exists() && JSON.stringify(await readLeaseReceipt(savedRequest)) !== JSON.stringify(request))
      throw Error("CAMPAIGN_REQUEST_CHANGED")
    await writeLeaseReceipt(savedRequest, request)
    const issue = await api(endpoint) as { id: string; created_at: string; status: string; revision: number }
    if (issue.id !== request.issueId || !Number.isFinite(Date.parse(issue.created_at))) throw Error("CAMPAIGN_ISSUE_UNCONFIRMED")
    const manifestFile = path.join(stateDir, "manifest.json")
    const unit = config.launch.campaignUnit.replace("{campaign}", campaignId)
    const result = { campaignId, stateDir, manifestFile, unit }
    if (await Bun.file(path.join(stateDir, "journal.json")).exists()) {
      const journal = await readLeaseReceipt(path.join(stateDir, "journal.json")) as { published?: boolean; final?: string }
      if (journal.published) return result
      if (journal.final) throw Error("CAMPAIGN_FINAL")
    }
    if (!["in_progress", "blocked"].includes(issue.status)) throw Error("CAMPAIGN_ISSUE_NOT_ACTIVE")
    const agents = await api("/api/agents") as { id: string; name: string }[]
    const leaders = agents.filter(agent => agent.name === "EvalOps")
    if (leaders.length !== 1) throw Error("CAMPAIGN_LEADER_AMBIGUOUS")
    const instruction = `<!-- eval-launch:${campaignId} -->\nПрочитай ${manifestFile} и ${serverFile}. Продолжай эту кампанию через установленный runbook. ` +
      "Сверь journal, unit и native tasks. Выполни доступный scoped repair/resume. Сохраняй pins, исходный clock, результаты и чужие ресурсы. " +
      "При неизменном состоянии periodic заверши штатным check-in без комментария."
    const wakeupIds: string[] = []
    for (const spec of [
      { kind: "event", mode: "continuous", condition: { type: "issue_field", field: "status", value: "blocked" } },
      { kind: "every", mode: "continuous", interval_seconds: 7200 },
    ]) {
      const text = `${instruction}\n${spec.kind}`
      let rules = await api(`${endpoint}/wakeups`) as Wakeup[]
      if (!rules.some(rule => rule.instruction === text)) {
        // A failed HTTP reply can still mean that the write committed. Reconcile before retrying.
        await api(`${endpoint}/wakeups`, "POST", { ...spec, instruction: text, agent_id: leaders[0]!.id }).catch(() => undefined)
        rules = await api(`${endpoint}/wakeups`) as Wakeup[]
      }
      const matches = rules.filter(rule => rule.instruction === text)
      if (matches.length !== 1 || !matches[0]!.enabled || matches[0]!.agent_id !== leaders[0]!.id) throw Error("CAMPAIGN_WAKEUP_UNCONFIRMED")
      wakeupIds.push(matches[0]!.id)
    }
    const manifest: CampaignManifest = { ...request, id: campaignId, server: config.server, wakeupIds }
    if (await Bun.file(manifestFile).exists() && JSON.stringify(await readLeaseReceipt(manifestFile)) !== JSON.stringify(manifest))
      throw Error("CAMPAIGN_MANIFEST_CHANGED")
    await writeLeaseReceipt(manifestFile, manifest)
    const environment = { ...process.env, ...parseEnv(await Bun.file(config.launch.environmentFile ?? config.batchEnvFile).text()) }
    const service = config.launch.serviceCommand ?? ["sudo", "-n", "systemctl"]
    if ((await launchCommand([...service, "is-active", "--quiet", unit], config.harnessRoot, environment)).code === 0 &&
      (await launchCommand([...service, "is-enabled", "--quiet", unit], config.harnessRoot, environment)).code === 0) return result
    const journalFile = path.join(stateDir, "journal.json")
    const controller = config.launch.controllerCommand ?? [process.execPath, "--no-env-file", "run", path.join(config.harnessRoot, "script/run-campaign.ts")]
    const reserve = [...controller, "--manifest", manifestFile, "--server", serverFile, "--operation", "reserve",
      ...(await Bun.file(journalFile).exists() ? [] : ["--initial-progress-at", issue.created_at])]
    if ((await launchCommand(reserve, config.harnessRoot, environment)).code !== 0) throw Error("CAMPAIGN_RESERVE_FAILED")
    for (const operation of ["prepare", "verify"] as const) {
      const receiptFile = path.join(stateDir, `launch-${operation}.json`)
      if (await Bun.file(receiptFile).exists()) {
        const receipt = await readLeaseReceipt(receiptFile) as { receipt: string; previous?: string[] }
        const observed = await readLeaseReceipt(receipt.receipt) as { ready?: boolean; finalization?: { status?: string } }
        if (observed.ready && observed.finalization?.status === "released") continue
        if (observed.ready !== false) throw Error("CAMPAIGN_LAUNCH_READINESS_UNCONFIRMED")
        // Fresh native verification proves the repaired environment and released ownership.
        // The original failed receipt remains immutable, and an unknown invocation is never replayed.
        const recovery = path.join(stateDir, `launch-${operation}-recovery-${crypto.randomUUID()}`)
        await writeLeaseReceipt(receiptFile, { receipt: path.join(recovery, "receipt.json"), previous: [...receipt.previous ?? [], receipt.receipt] })
        const args = config.launch.verifyCommand.map(value => value === "{outputDir}" ? recovery : value)
        if ((await launchCommand(args, config.harnessRoot, environment)).code !== 0) throw Error("CAMPAIGN_LAUNCH_READINESS_UNCONFIRMED")
        const verified = await readLeaseReceipt(path.join(recovery, "receipt.json")) as { ready?: boolean; finalization?: { status?: string } }
        if (!verified.ready || verified.finalization?.status !== "released") throw Error("CAMPAIGN_LAUNCH_READINESS_UNCONFIRMED")
        continue
      }
      const outputDir = path.join(stateDir, `launch-${operation}-${crypto.randomUUID()}`)
      await writeLeaseReceipt(receiptFile, { receipt: path.join(outputDir, "receipt.json") })
      const args = config.launch[`${operation}Command`].map(value => value === "{outputDir}" ? outputDir : value)
      if ((await launchCommand(args, config.harnessRoot, environment)).code !== 0) throw Error(`CAMPAIGN_LAUNCH_${operation.toUpperCase()}_FAILED`)
      const observed = await readLeaseReceipt(path.join(outputDir, "receipt.json")) as { ready?: boolean; finalization?: { status?: string } }
      if (!observed.ready || observed.finalization?.status !== "released") throw Error("CAMPAIGN_LAUNCH_READINESS_UNCONFIRMED")
    }
    if ((await launchCommand([...service, "enable", "--now", unit], config.harnessRoot, environment)).code !== 0 ||
      (await launchCommand([...service, "is-active", "--quiet", unit], config.harnessRoot, environment)).code !== 0 ||
      (await launchCommand([...service, "is-enabled", "--quiet", unit], config.harnessRoot, environment)).code !== 0) throw Error("CAMPAIGN_SERVICE_UNCONFIRMED")
    return result
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "CAMPAIGN_LAUNCH_FAILED"
    await writeLeaseReceipt(path.join(stateDir, "launch-error.json"), { code, observedAt: new Date().toISOString() })
    // Preserve the local diagnostic if the API itself is unavailable during startup.
    await (async () => {
      const issue = await api(endpoint) as { status: string; revision: number }
      if (["in_progress", "blocked"].includes(issue.status)) {
        const marker = `<!-- eval-launch-blocker:${campaignId} -->`
        const content = `${marker}\nЗапуск приостановлен: ${code}. Evidence: ${path.join(stateDir, "launch-error.json")}. EvalOps продолжает диагностику в этой карточке.`
        const comments = await api(`${endpoint}/comments`) as { id: string; content: string; revision: number }[]
        const previous = comments.find(comment => comment.content.includes(marker))
        if (previous?.content !== content) {
          const preview = await api(`${endpoint}/comments/trigger-preview`, "POST", { content,
            ...(previous ? { editing_comment_id: previous.id } : {}) }) as { agents: { id: string }[] }
          await api(previous ? `/api/comments/${previous.id}` : `${endpoint}/comments`, previous ? "PUT" : "POST", {
            content, suppress_agent_ids: preview.agents.map(agent => agent.id),
            ...(previous ? { content_base: previous.content, expected_revision: previous.revision } : {}) })
        }
        if (issue.status !== "blocked") await api(endpoint, "PUT", { status: "blocked", expected_revision: issue.revision, suppress_run: true })
      }
    })().catch(() => undefined)
    throw Error(code)
  } finally { await unlock() }
}

async function launchCommand(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const process = Bun.spawn(args, { cwd, env, stdin: "ignore", stdout: "ignore", stderr: "ignore" })
  return { code: await process.exited }
}

if (import.meta.main) {
  const args = parseArgs({ args: Bun.argv.slice(2), options: { request: { type: "string" }, server: { type: "string" } } })
  if (!args.values.request || !args.values.server) throw Error("CAMPAIGN_LAUNCH_ARGUMENTS")
  try { console.log(JSON.stringify(await launchCampaign(await readLeaseReceipt(args.values.request) as CampaignRequest, args.values.server))) }
  catch (error) { console.error(error instanceof Error ? error.message : "CAMPAIGN_LAUNCH_FAILED"); process.exitCode = 2 }
}
