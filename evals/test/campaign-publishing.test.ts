import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { publishCampaign, syncCampaignIssue, type CampaignManifest, type CampaignJournal } from "../script/run-campaign"

async function publishingFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-publishing-"))
  const comments: { id: string; content: string; revision: number; attachment_ids?: string[] }[] = []
  const attachments: { id: string; filename: string; bytes: Uint8Array }[] = []
  const writes: { route: string; body: Record<string, unknown> }[] = []
  const issue = { revision: 1, status: "in_progress" }
  const wakeups = [{ id: "timer", enabled: true }, { id: "other-campaign", enabled: true }]
  const controls = { failComment: false, unwantedAgentRuns: 0 }
  const server = Bun.serve({ port: 0, async fetch(request) {
    const route = new URL(request.url).pathname
    if (route === "/api/upload-file") {
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
      return Response.json({ agents: [{ id: "baseline" }] })
    }
    if (route.endsWith("/comments") && request.method === "GET") return Response.json(comments)
    if (route.endsWith("/comments") || route.startsWith("/api/comments/")) {
      const data = await request.json()
      writes.push({ route, body: data })
      if (controls.failComment) { controls.failComment = false; return new Response(null, { status: 503 }) }
      if (!data.suppress_agent_ids?.includes("baseline")) controls.unwantedAgentRuns++
      if (request.method === "PUT") {
        const comment = comments.find(item => route === `/api/comments/${item.id}`)!
        if (data.expected_revision !== comment.revision || data.content_base !== comment.content) return new Response(null, { status: 409 })
        Object.assign(comment, data, { revision: comment.revision + 1 })
        return Response.json(comment)
      }
      const comment = { ...data, id: `comment-${comments.length + 1}`, revision: 1 }
      comments.push(comment)
      return Response.json(comment)
    }
    if (route.endsWith("/disable")) {
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
    keys: [{ corpus: "ordinary", taskId: "first", round: 1 }], pins: {}, wakeupIds: ["timer"] }
  const journal: CampaignJournal = { manifestHash: "test", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
    repairing: false, repairer: null, batches: [], attempts: [{ key: manifest.keys[0]!, resultFile: "/saved/result.json", status: "no_artifact",
      counted: true, pass: false, score: 0, cleanupConfirmed: true }], lastProgressAt: 1000, consecutiveErrors: 0 }
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
    expect(fixture.wakeups).toEqual([{ id: "timer", enabled: false }, { id: "other-campaign", enabled: true }])
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
    expect(fixture.attachments).toHaveLength(1)
    expect(fixture.comments).toHaveLength(0)
    fixture.journal.final = "partial"
    fixture.journal.cleanupVerified = false
    fixture.journal.blocker = "DELIVERY_DEADLINE"
    await publishCampaign(fixture.manifest, fixture.journal, fixture.config)
    expect(fixture.attachments).toHaveLength(2)
    expect(fixture.comments).toHaveLength(1)
    const report = fixture.comments[0]!
    expect(report.content).toContain("<!-- eval-final:partial -->")
    expect(report.content).toContain("globalcleanupConfirmed=false")
    expect(report.content).toContain("последним известным данным")
    expect(report.content).toContain("Непроверенные ресурсы остаются неподтверждёнными")
    expect(report.content).toContain("FAIL")
    expect(report.attachment_ids).toEqual([fixture.attachments[1]!.id])
    const archive = path.join(fixture.root, fixture.attachments[1]!.filename)
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
