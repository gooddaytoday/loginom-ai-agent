import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { emptyResult } from "../src/run"
import { campaignTick, prepareCampaignBatch, publishCampaign, type CampaignManifest, type CampaignJournal } from "../script/run-campaign"

test("campaign accounts a saved quality FAIL without summary and selects only the missing key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-"))
  try {
    const manifest: CampaignManifest = { id: "campaign-1", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }, { corpus: "ordinary", taskId: "second", round: 1 }], pins: {} }
    const batch = { id: "batch-1", keys: [manifest.keys[0]!], resultsDir: path.join(root, "batch-1"), invocationBefore: "prior", started: true }
    const out = path.join(batch.resultsDir, "run-1/first/1")
    await mkdir(out, { recursive: true })
    await Bun.write(path.join(out, "result.json"), JSON.stringify({ ...emptyResult("first", 1, false), status: "no_artifact",
      score: 0, pass: false, judge_status: "no_artifact", harness_error: null, interrupted: false,
      environment_cleanup: { status: "confirmed", evidence: "cleanup.json", error: null } }))
    await Bun.write(path.join(out, "cleanup.json"), JSON.stringify({ processes: { status: "confirmed" }, nextAdmissionAllowed: true }))
    const state: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [batch], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
    const tick = await campaignTick(manifest, state, { active: false, invocation: "finished", exitCode: 0 }, 2000)
    expect(tick.action).toBe("start")
    expect(tick.journal.attempts).toMatchObject([{ key: manifest.keys[0], counted: true, pass: false }])
    expect(tick.next).toEqual([manifest.keys[1]!])
    const again = await campaignTick(manifest, tick.journal, { active: false, invocation: "finished", exitCode: 0 }, 3000)
    expect(again.journal.attempts).toHaveLength(1)
    expect(again.next).toEqual([manifest.keys[1]!])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("campaign leaves an unowned live batch untouched and blocks conflicting dispatch", async () => {
  const manifest: CampaignManifest = { id: "live", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {} }
  const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: false, repairer: null, batches: [], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
  const tick = await campaignTick(manifest, journal, { active: true, invocation: "live", exitCode: 0 }, 2000)
  expect(tick.action).toBe("blocked")
  expect(tick.journal.blocker).toBe("UNOWNED_BATCH_ACTIVE")
  expect(tick.journal.attempts).toEqual([])
})

test("campaign durably records a batch before exposing its parameters and reuses that admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-admission-"))
  try {
    const manifest: CampaignManifest = { id: "admission", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: { EVAL_AGENT_MODEL: "pinned/model" } }
    const state: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [], attempts: [], lastProgressAt: 1000, consecutiveErrors: 0 }
    const config = { stateDir: root, batchEnvFile: path.join(root, "batch.env"), resourceBudgetFile: path.join(root, "budget.json"),
      corpora: { ordinary: { entrypoint: "src/run.ts", tasks: "tasks" } } }
    const batch = await prepareCampaignBatch(manifest, state, manifest.keys, "old-unit", config)
    const saved = await Bun.file(path.join(root, "journal.json")).json()
    expect(saved.batches).toEqual([batch])
    const env = await Bun.file(config.batchEnvFile).text()
    expect(env).toContain('EVAL_AGENT_MODEL="pinned/model"')
    expect(env).toContain(`EVAL_RESULTS_DIR=${JSON.stringify(batch.resultsDir)}`)
    expect((await prepareCampaignBatch(manifest, state, manifest.keys, "old-unit", config)).id).toBe(batch.id)
    expect(state.batches).toHaveLength(1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("campaign publishes its saved FAIL once and reads back the final issue and disabled wakeup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-publish-"))
  const comments: { id: string; content: string }[] = []
  const attachments: { id: string; filename: string }[] = []
  let uploaded = new Uint8Array()
  let downloads = 0
  let unwantedAgentRuns = 0
  const issue = { revision: 1, status: "in_progress" }
  const wakeup = { id: "timer", enabled: true }
  const server = Bun.serve({ port: 0, async fetch(request) {
    const route = new URL(request.url).pathname
    if (route === "/api/upload-file") {
      const data = await request.formData()
      const file = data.get("file") as File
      uploaded = new Uint8Array(await file.arrayBuffer())
      const attachment = { id: "archive", filename: file.name }
      attachments.push(attachment)
      return Response.json(attachment)
    }
    if (route.endsWith("/download")) { downloads++; return new Response(uploaded) }
    if (route.endsWith("/attachments")) return Response.json(attachments)
    if (route.endsWith("/comments/trigger-preview")) return Response.json({ agents: [{ id: "baseline" }] })
    if (route.endsWith("/comments")) {
      if (request.method === "POST") {
        const data = await request.json()
        if (!data.suppress_agent_ids?.includes("baseline")) unwantedAgentRuns++
        comments.push({ ...data, id: "report" })
      }
      return Response.json(request.method === "POST" ? comments.at(-1) : comments)
    }
    if (route.endsWith("/disable")) { wakeup.enabled = false; return Response.json(wakeup) }
    if (route.endsWith("/wakeups")) return Response.json([wakeup])
    if (request.method === "PUT") Object.assign(issue, await request.json())
    return Response.json(issue)
  } })
  try {
    const manifest: CampaignManifest = { id: "publish", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {}, wakeupIds: ["timer"] }
    const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [], attempts: [{ key: manifest.keys[0]!, resultFile: "/saved/result.json", status: "no_artifact",
        counted: true, pass: false, score: 0, cleanupConfirmed: true }], lastProgressAt: 1000, consecutiveErrors: 0, final: "full" }
    await Bun.write(path.join(root, "token"), "fixture-token", { mode: 0o600 })
    const config = { stateDir: root, multica: { url: `http://127.0.0.1:${server.port}`, workspace: "lab", issueId: "issue", tokenFile: path.join(root, "token") } }
    await publishCampaign(manifest, journal, config)
    await publishCampaign(manifest, journal, config)
    expect(comments).toHaveLength(1)
    expect(comments[0]!.content).toContain("полный")
    expect(comments[0]!.content).toContain("FAIL")
    expect(issue.status).toBe("in_review")
    expect(wakeup.enabled).toBe(false)
    expect(journal.published).toBe(true)
    expect(attachments).toHaveLength(1)
    expect(downloads).toBeGreaterThan(0)
    expect(uploaded.length).toBeGreaterThan(0)
    expect(unwantedAgentRuns).toBe(0)
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
})
