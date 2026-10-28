import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { publishCampaign, syncCampaignIssue, type CampaignManifest, type CampaignJournal } from "../script/run-campaign"

async function publishingFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-publishing-"))
  const comments: { id: string; content: string; revision: number; attachments?: { id: string }[]; author_type?: string; author_id?: string; parent_id?: string; source_task_id?: string }[] = []
  const attachments: { id: string; filename: string; bytes: Uint8Array }[] = []
  const writes: { route: string; body: Record<string, unknown> }[] = []
  const issue = { revision: 1, status: "in_progress" }
  const wakeups = [{ id: "timer", kind: "every", enabled: true }, { id: "event", kind: "event", enabled: true }, { id: "other-campaign", kind: "every", enabled: true }]
  const controls = { failComment: false, failUpload: false, loseCommentResponse: false, failDisable: false, autoReply: false, previewTarget: true, unwantedAgentRuns: 0 }
  const server = Bun.serve({ port: 0, async fetch(request) {
    const route = new URL(request.url).pathname
    if (route === "/api/agents") return Response.json([{ id: "runner", name: "EvalBaseline" }])
    if (route === "/api/upload-file") {
      if (controls.failUpload) return new Response(null, { status: 503 })
      const form = await request.formData()
      const file = form.get("file") as File
      const attachment = { id: `archive-${attachments.length + 1}`, filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      attachments.push(attachment)
      return Response.json({ id: attachment.id, filename: attachment.filename })
    }
    if (route.endsWith("/download")) {
      const attachment = attachments.find(item => route === `/api/attachments/${item.id}/download`)
      return attachment ? new Response(attachment.bytes) : new Response(null, { status: 404 })
    }
    if (route.endsWith("/attachments")) return Response.json(attachments.map(({ id, filename }) => ({ id, filename })))
    if (route.endsWith("/comments/trigger-preview")) {
      writes.push({ route, body: await request.json() })
      return Response.json({ agents: [{ id: "baseline" }, ...controls.previewTarget ? [{ id: "runner" }] : []] })
    }
    if (route.endsWith("/comments") && request.method === "GET") {
      const report = comments.find(comment => comment.content.includes("<!-- eval-handoff:"))
      if (controls.autoReply && report && !comments.some(comment => comment.id === "runner-final")) comments.push({ id: "runner-final", revision: 1,
        author_type: "agent", author_id: "runner", parent_id: report.id, content: "<!-- eval-executor-final:publication -->" })
      return Response.json(comments)
    }
    if (route.endsWith("/comments") || route.startsWith("/api/comments/")) {
      const data = await request.json()
      writes.push({ route, body: data })
      if (controls.failComment) { controls.failComment = false; return new Response(null, { status: 503 }) }
      if (!data.suppress_agent_ids?.includes("baseline")) controls.unwantedAgentRuns++
      if (request.method === "PUT") {
        const comment = comments.find(item => route === `/api/comments/${item.id}`)!
        if (data.expected_revision !== comment.revision || data.content_base !== comment.content) return new Response(null, { status: 409 })
        Object.assign(comment, data, { attachments: data.attachment_ids?.map((id: string) => ({ id })), revision: comment.revision + 1 })
        return Response.json(comment)
      }
      const comment = { ...data, id: `comment-${comments.length + 1}`, revision: 1 }
      comments.push(comment)
      if (controls.loseCommentResponse) { controls.loseCommentResponse = false; return new Response(null, { status: 503 }) }
      return Response.json(comment)
    }
    if (route.endsWith("/disable")) {
      if (controls.failDisable) { controls.failDisable = false; return new Response(null, { status: 503 }) }
      wakeups.find(item => route.endsWith(`/wakeups/${item.id}/disable`))!.enabled = false
      return Response.json({})
    }
    if (route.endsWith("/wakeups")) return Response.json(wakeups)
    if (request.method === "PUT") {
      const data = await request.json()
      writes.push({ route, body: data })
      if (data.expected_revision !== issue.revision) return new Response(null, { status: 409 })
      Object.assign(issue, data, { revision: issue.revision + 1 })
    }
    return Response.json(issue)
  } })
  await Bun.write(path.join(root, "token"), "fixture-token", { mode: 0o600 })
  const manifest: CampaignManifest = { id: "publication", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {}, wakeupIds: ["timer", "event"] }
  const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: false, repairer: null, batches: [], attempts: [{ key: manifest.keys[0]!, resultFile: "/saved/result.json", status: "no_artifact",
      counted: true, pass: false, score: 0, cleanupConfirmed: true }], lastProgressAt: Date.now(), consecutiveErrors: 0 }
  return { root, comments, attachments, writes, issue, wakeups, controls, manifest, journal,
    config: { stateDir: root, multica: { url: `http://127.0.0.1:${server.port}`, workspace: "lab", issueId: "issue", tokenFile: path.join(root, "token") } },
    async close() { server.stop(true); await rm(root, { recursive: true, force: true }) } }
}

test("campaign adopts an Ops partial over its pending full and finishes only the final status and own wakeup", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.issue.status = "blocked"
    const content = "<!-- eval-campaign:publication -->\n<!-- eval-final:partial -->\n# частичный: хост недоступен\nПоследние известные данные; ресурсы не подтверждены."
    fixture.comments.push({ id: "ops-final", content, revision: 1 })
    expect(await syncCampaignIssue(fixture.manifest, fixture.journal, fixture.config)).toBe(true)
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.journal).toMatchObject({ final: "partial", published: true, reportCommentId: "ops-final" })
    expect(fixture.journal.attempts[0]).toMatchObject({ counted: true, pass: false })
    expect(fixture.comments).toEqual([{ id: "ops-final", content, revision: 1 }])
    expect(fixture.attachments).toEqual([])
    expect(fixture.issue.status).toBe("in_review")
    expect(fixture.wakeups.map(rule => [rule.id, rule.enabled])).toEqual([["timer", false], ["event", false], ["other-campaign", true]])
    expect(fixture.writes.every(write => write.body.status === "in_review" && write.body.suppress_run === true)).toBe(true)
    expect((await Bun.file(path.join(fixture.root, "journal.json")).json()).published).toBe(true)
  } finally { await fixture.close() }
})

test("delivery retry from full to partial attaches the archive containing exactly the final report", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.cleanupVerified = true
    fixture.controls.failComment = true
    await expect(publishCampaign(fixture.manifest, fixture.journal, fixture.config)).rejects.toThrow("MULTICA_503")
    expect(fixture.attachments).toHaveLength(0)
    expect(fixture.comments).toHaveLength(0)
    fixture.journal.final = "partial"
    fixture.journal.cleanupVerified = false
    fixture.journal.blocker = "DELIVERY_DEADLINE"
    fixture.controls.autoReply = true
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.attachments).toHaveLength(1)
    expect(fixture.comments).toHaveLength(2)
    const report = fixture.comments[0]!
    expect(report.content).toContain("<!-- eval-final:partial -->")
    expect(report.content).toContain("globalcleanupConfirmed=false")
    expect(report.content).toContain("последним известным данным")
    expect(report.content).toContain("Непроверенные ресурсы остаются неподтверждёнными")
    expect(report.content).toContain("FAIL")
    expect(report.attachments?.map(item => item.id)).toEqual([fixture.attachments[0]!.id])
    const archive = path.join(fixture.root, fixture.attachments[0]!.filename)
    const child = Bun.spawn(["tar", "-xOzf", archive, "report.md"], { stdout: "pipe", stderr: "pipe" })
    const [code, archivedReport] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(archivedReport).toBe(report.content)
    expect(fixture.controls.unwantedAgentRuns).toBe(0)
    expect(fixture.issue.status).toBe("in_review")
    expect(fixture.wakeups[0]!.enabled).toBe(false)
  } finally { await fixture.close() }
})

test("campaign updates one blocker record only on reason changes and resolution without waking executors", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.blocker = "NATIVE_VERIFY_FAILED"
    expect(await syncCampaignIssue(fixture.manifest, fixture.journal, fixture.config)).toBe(false)
    expect(fixture.comments).toHaveLength(1)
    expect(fixture.comments[0]!.content).toContain("<!-- eval-blocker:publication -->")
    expect(fixture.comments[0]!.content).toContain("NATIVE_VERIFY_FAILED")
    expect(fixture.issue.status).toBe("blocked")
    expect(fixture.journal.blockerCommentId).toBe(fixture.comments[0]!.id)
    const writes = fixture.writes.length
    await syncCampaignIssue(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.writes).toHaveLength(writes)
    fixture.journal.blocker = "AUTH_REVOKED"
    fixture.journal.blockerKind = "external"
    await syncCampaignIssue(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.comments).toHaveLength(1)
    expect(fixture.comments[0]!.content).toContain("AUTH_REVOKED")
    expect(fixture.comments[0]!.revision).toBe(2)
    expect(fixture.issue.status).toBe("in_progress")
    delete fixture.journal.blocker
    delete fixture.journal.blockerKind
    await syncCampaignIssue(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.comments).toHaveLength(1)
    expect(fixture.comments[0]!.content).toContain("Блокер устранён")
    expect(fixture.comments[0]!.revision).toBe(3)
    const resolvedWrites = fixture.writes.length
    await syncCampaignIssue(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.writes).toHaveLength(resolvedWrites)
    expect(fixture.writes.filter(write => write.route.endsWith("trigger-preview")).map(write => write.body.editing_comment_id))
      .toEqual([undefined, fixture.comments[0]!.id, fixture.comments[0]!.id])
    expect(fixture.writes.filter(write => write.body.status).every(write => write.body.suppress_run === true)).toBe(true)
    expect(fixture.controls.unwantedAgentRuns).toBe(0)
    expect(fixture.wakeups.every(rule => rule.enabled)).toBe(true)
  } finally { await fixture.close() }
})


test("terminal result wakes its executor and stops its periodic wakeup even when archive upload fails", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.cleanupVerified = true
    fixture.controls.failUpload = true
    const attempts = structuredClone(fixture.journal.attempts)
    await expect(publishCampaign(fixture.manifest, fixture.journal, fixture.config)).rejects.toThrow("MULTICA_503")
    expect(fixture.comments).toHaveLength(1)
    expect(fixture.comments[0]!.content).toContain("mention://agent/runner")
    expect(fixture.comments[0]!.content).toContain("<!-- eval-handoff:publication -->")
    expect(fixture.journal.reportCommentId).toBe(fixture.comments[0]!.id)
    expect(fixture.journal).toMatchObject({ executorAgentId: "runner" })
    expect(fixture.wakeups.map(rule => [rule.id, rule.enabled])).toEqual([["timer", false], ["event", true], ["other-campaign", true]])
    expect(fixture.writes.find(write => write.route.endsWith("/comments"))!.body.suppress_agent_ids).toEqual(["baseline"])
    expect(fixture.journal.published).not.toBe(true)
    expect(fixture.journal.attempts).toEqual(attempts)
    expect(fixture.issue.status).toBe("blocked")
  } finally { await fixture.close() }
})


test("archive alone and unrelated responses cannot replace the executor's separate final reply", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.cleanupVerified = true
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.attachments).toHaveLength(1)
    expect(fixture.journal.published).not.toBe(true)
    expect(fixture.issue.status).toBe("in_progress")
    for (const invalid of [
      { author_type: "user", author_id: "runner", parent_id: fixture.journal.reportCommentId },
      { author_type: "agent", author_id: "other", parent_id: fixture.journal.reportCommentId },
      { author_type: "agent", author_id: "runner", parent_id: "another-thread" },
      { author_type: "agent", author_id: "runner", parent_id: fixture.journal.reportCommentId, content: "No final marker" },
    ]) {
      fixture.comments.push({ id: `invalid-${fixture.comments.length}`, revision: 1,
        content: "<!-- eval-executor-final:publication -->", ...invalid })
    }
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.journal.published).not.toBe(true)
    expect(fixture.journal.executorResponseCommentId).toBeUndefined()
    fixture.comments.push({ id: "executor-final", revision: 1, author_type: "agent", author_id: "runner",
      parent_id: fixture.journal.reportCommentId, source_task_id: "task", content: "<!-- eval-executor-final:publication -->\n1/1; FAIL 1; cleanup confirmed; archive delivered." })
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.journal).toMatchObject({ published: true, executorResponseCommentId: "executor-final" })
    expect(fixture.attachments).toHaveLength(1)
    expect(fixture.issue.status).toBe("in_review")
    expect(fixture.wakeups.map(rule => [rule.id, rule.enabled])).toEqual([["timer", false], ["event", false], ["other-campaign", true]])
  } finally { await fixture.close() }
})


test("restart recovers a persisted handoff after losing POST acknowledgement and retries failed periodic disable", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.cleanupVerified = true
    fixture.controls.loseCommentResponse = true
    await expect(publishCampaign(fixture.manifest, fixture.journal, fixture.config)).rejects.toThrow("MULTICA_503")
    const durable = await Bun.file(path.join(fixture.root, "journal.json")).json() as CampaignJournal
    expect(durable.executorAgentId).toBe("runner")
    expect(durable.reportCommentId).toBeUndefined()
    expect(fixture.comments).toHaveLength(1)
    fixture.controls.failDisable = true
    await expect(publishCampaign(fixture.manifest, durable, fixture.config)).rejects.toThrow("MULTICA_503")
    expect(fixture.comments).toHaveLength(1)
    fixture.controls.failUpload = true
    fixture.comments.push({ id: "runner-final", revision: 1, author_type: "agent", author_id: "runner", parent_id: fixture.comments[0]!.id,
      content: "<!-- eval-executor-final:publication -->\n1/1; FAIL 1; cleanup confirmed; archive pending." })
    const restarted = await Bun.file(path.join(fixture.root, "journal.json")).json() as CampaignJournal
    await expect(publishCampaign(fixture.manifest, restarted, fixture.config)).rejects.toThrow("MULTICA_503")
    expect(restarted.executorResponseCommentId).toBe("runner-final")
    expect(restarted.published).not.toBe(true)
    expect(fixture.wakeups[0]!.enabled).toBe(false)
    fixture.controls.failUpload = false
    await publishCampaign(fixture.manifest, restarted, fixture.config)
    expect(restarted.published).toBe(true)
    expect(fixture.comments.filter(comment => comment.content.includes("<!-- eval-handoff:publication -->"))).toHaveLength(1)
    expect(fixture.attachments).toHaveLength(1)
  } finally { await fixture.close() }
})


test("handoff refuses a preview that cannot trigger its assigned executor", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.cleanupVerified = true
    fixture.controls.previewTarget = false
    await expect(publishCampaign(fixture.manifest, fixture.journal, fixture.config)).rejects.toThrow("CAMPAIGN_EXECUTOR_TRIGGER_MISSING")
    expect(fixture.comments).toEqual([])
    expect(fixture.journal.attempts[0]!.counted).toBe(true)
    expect(fixture.journal.published).not.toBe(true)
    expect(await Bun.file(path.join(fixture.root, "report.md")).text()).toContain("FAIL")
  } finally { await fixture.close() }
})

test("a delivery failure blocks the issue once for its existing repair event and preserves the verified result", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.cleanupVerified = true
    fixture.controls.failUpload = true
    await expect(publishCampaign(fixture.manifest, fixture.journal, fixture.config)).rejects.toThrow("MULTICA_503")
    expect(fixture.issue.status).toBe("blocked")
    expect(fixture.journal.reportingError).toBe("MULTICA_503")
    await expect(publishCampaign(fixture.manifest, fixture.journal, fixture.config)).rejects.toThrow("MULTICA_503")
    expect(fixture.writes.filter(write => write.body.status === "blocked")).toHaveLength(1)
    expect(fixture.journal).toMatchObject({ final: "full", cleanupVerified: true })
    fixture.controls.failUpload = false
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.journal.reportingError).toBeUndefined()
    expect(fixture.issue.status).toBe("in_progress")
  } finally { await fixture.close() }
})

test("a new handoff supersedes an unpublished legacy full report across restart", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.cleanupVerified = true
    fixture.controls.autoReply = true
    fixture.comments.push({ id: "legacy-full", revision: 1, content: "<!-- eval-campaign:publication -->\n<!-- eval-final:full -->\n# полный" })
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config)
    const handoff = fixture.comments.find(comment => comment.content.includes("<!-- eval-handoff:publication -->"))!
    expect(fixture.journal).toMatchObject({ published: true, reportCommentId: handoff.id, executorResponseCommentId: "runner-final" })
    const restarted = await Bun.file(path.join(fixture.root, "journal.json")).json() as CampaignJournal
    expect(await syncCampaignIssue(fixture.manifest, restarted, fixture.config)).toBe(true)
    expect(restarted.reportCommentId).toBe(handoff.id)
  } finally { await fixture.close() }
})

test("the existing deadline raises one repair event for a missing executor reply without changing full quality", async () => {
  const fixture = await publishingFixture()
  try {
    fixture.journal.final = "full"
    fixture.journal.cleanupVerified = true
    const deadline = fixture.journal.lastProgressAt + 24 * 3600000
    await expect(publishCampaign(fixture.manifest, fixture.journal, fixture.config, deadline)).rejects.toThrow("CAMPAIGN_EXECUTOR_RESPONSE_MISSING")
    expect(fixture.journal).toMatchObject({ final: "full", cleanupVerified: true, reportingError: "CAMPAIGN_EXECUTOR_RESPONSE_MISSING" })
    expect(fixture.issue.status).toBe("blocked")
    expect(fixture.attachments).toHaveLength(1)
    await expect(publishCampaign(fixture.manifest, fixture.journal, fixture.config, deadline + 1)).rejects.toThrow("CAMPAIGN_EXECUTOR_RESPONSE_MISSING")
    expect(fixture.writes.filter(write => write.body.status === "blocked")).toHaveLength(1)
    fixture.comments.push({ id: "runner-final", revision: 1, author_type: "agent", author_id: "runner", parent_id: fixture.journal.reportCommentId,
      content: "<!-- eval-executor-final:publication -->\n1/1; FAIL 1; cleanup confirmed; archive delivered." })
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config, deadline + 2)
    expect(fixture.journal).toMatchObject({ final: "full", published: true, executorResponseCommentId: "runner-final" })
    expect(fixture.journal.reportingError).toBeUndefined()
    expect(fixture.issue.status).toBe("in_review")
  } finally { await fixture.close() }
})
