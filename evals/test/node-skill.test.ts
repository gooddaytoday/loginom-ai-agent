import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot, repoRoot } from "../src/config"

const builder = path.join(evalsRoot, "skills/loginom-node-eval-case/scripts/reference-attempt.ts")

async function fixture(id: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-skill-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ result: { revision: "fixture" } }) })
  const draft = path.join(root, id)
  await cp(path.join(evalsRoot, "tasks/group-sum-qty"), draft, { recursive: true })
  await rm(path.join(draft, "reference.lgp"))
  const raw = await Bun.file(path.join(draft, "task.json")).json()
  await Bun.write(path.join(draft, "task.json"), JSON.stringify({ ...raw, id }))
  const env = { ...process.env, AGENT_REPO: repoRoot,
    EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_AGENT_VARIANT: "default",
    EVAL_PROFILE_DIR: path.join(root, "profile"), EVAL_WORKSPACE_ROOT: path.join(root, "work"),
    EVAL_RESULTS_DIR: path.join(root, "results"), EVAL_TASK_TIMEOUT_MS: "10000",
    EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`,
    LOGINOM_DOCK_API_KEY: "fixture-key", LOGINOM_URL: `http://127.0.0.1:${server.port}`,
    LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
    EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture",
    EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider", EVAL_AGENT_PROVIDER_MODEL_ID: "model" }
  return { root, draft, env, async close() { server.stop(true); await rm(root, { recursive: true, force: true }) } }
}

async function execute(draft: string, env: Record<string, string | undefined>, attempt = "1") {
  const run = Bun.spawn([process.execPath, builder, draft, attempt], { env, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()])
  return { code, stdout, stderr }
}

test("node skill: draft without reference runs one fake attempt and archives cleanup", async () => {
  const f = await fixture("group-sum-qty")
  try {
    await Bun.write(path.join(f.draft, "expected-initial.csv"), "Key,Value\nN,3\n")
    const run = await execute(f.draft, f.env)
    expect(run.stderr).toBe("")
    expect(run.code).toBe(0)
    const report = JSON.parse(run.stdout)
    expect(report.result).toMatchObject({ task_id: "group-sum-qty", attempt: 1, status: "completed",
      environment_cleanup: { status: "confirmed" }, judge_status: "skipped" })
    expect(report.source_unchanged).toBe(true)
    expect((await Bun.file(path.join(report.run_dir, "source-hashes.json")).json())["expected-initial.csv"]).toMatch(/^[a-f0-9]{64}$/)
    expect(await Bun.file(path.join(report.attempt_dir, "artifact/package.lgp")).exists()).toBe(true)
    expect(await Bun.file(path.join(f.root, "profile.harness-lease/owner.json")).exists()).toBe(false)
    expect(await Bun.file(path.join(f.draft, "reference.lgp")).exists()).toBe(false)
    const saved = await Bun.file(path.join(report.run_dir, "builder-result.json")).text()
    const duplicate = await execute(f.draft, f.env)
    expect(duplicate.code).toBe(2)
    expect(duplicate.stderr).toContain("EEXIST")
    expect(await Bun.file(path.join(report.run_dir, "builder-result.json")).text()).toBe(saved)
    const fourth = await execute(f.draft, f.env, "4")
    expect(fourth.code).toBe(2)
    expect(fourth.stderr).toContain("<1|2|3>")
  } finally { await f.close() }
}, 30000)

test("node skill: failed measurement is preserved and confirmed cleanup releases profile", async () => {
  const f = await fixture("filter-active-rows")
  try {
    const run = await execute(f.draft, f.env)
    expect(run.code).toBe(1)
    expect(JSON.parse(run.stdout).result).toMatchObject({ status: "failed", exit_code: 1,
      environment_cleanup: { status: "confirmed" } })
    expect(await Bun.file(path.join(f.root, "profile.harness-lease/owner.json")).exists()).toBe(false)
  } finally { await f.close() }
}, 30000)

test("node skill: unknown cleanup retains profile lease and measured outcome", async () => {
  const f = await fixture("a-cleanup-failure")
  try {
    const run = await execute(f.draft, f.env)
    expect(run.code).toBe(2)
    const report = JSON.parse(run.stdout)
    expect(report.result).toMatchObject({ status: "no_artifact", environment_cleanup: { status: "failed" } })
    expect(await Bun.file(path.join(f.root, "profile.harness-lease/owner.json")).exists()).toBe(true)
    expect(await Bun.file(path.join(report.attempt_dir, "result.json")).json()).toEqual(report.result)
  } finally { await f.close() }
}, 30000)

test("node skill: Ctrl+C preserves interruption and runs cleanup", async () => {
  const f = await fixture("a-ready-timeout")
  try {
    const run = Bun.spawn([process.execPath, builder, f.draft, "1"], { env: f.env, stdout: "pipe", stderr: "pipe" })
    const events = path.join(f.root, "results/reference-a-ready-timeout-1/a-ready-timeout/1/events.jsonl")
    const deadline = Date.now() + 10000
    while (!(await Bun.file(events).exists()) && Date.now() < deadline) await Bun.sleep(50)
    await Bun.sleep(1200)
    run.kill("SIGINT")
    const [code, stdout, stderr] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()])
    expect(code).toBe(2)
    expect(stderr).toContain("Ctrl+C")
    const report = JSON.parse(stdout)
    expect(report.result).toMatchObject({ status: "interrupted", interrupted: true })
    expect(await Bun.file(path.join(report.attempt_dir, "cleanup.json")).exists()).toBe(true)
  } finally { await f.close() }
}, 60000)

test("node skill: standalone checker accepts explicit package and CSV", async () => {
  const caseDir = path.join(evalsRoot, "tasks/node-evals/crosstable-fixed-sum")
  const run = Bun.spawn(["python3", path.join(evalsRoot, "skills/loginom-node-eval-case/scripts/check_reference.py"),
    caseDir, path.join(caseDir, "reference.lgp"), path.join(caseDir, "oracle.csv")],
    { env: { ...process.env, AGENT_REPO: repoRoot }, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()])
  expect(stderr).toBe("")
  expect(code).toBe(0)
  expect(JSON.parse(stdout).pass).toBe(true)
})

test("node skill: checker rejects a changed CSV and a wrong node", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-skill-check-"))
  try {
    const caseDir = path.join(evalsRoot, "tasks/node-evals/crosstable-fixed-sum")
    await cp(caseDir, root, { recursive: true })
    const csv = path.join(root, "changed.csv")
    const oracle = await Bun.file(path.join(root, "oracle.csv")).text()
    await Bun.write(csv, oracle.replace(/\d/, "9"))
    async function check(result: string) {
      const run = Bun.spawn(["python3", path.join(evalsRoot, "skills/loginom-node-eval-case/scripts/check_reference.py"),
        root, path.join(root, "reference.lgp"), result], { env: { ...process.env, AGENT_REPO: repoRoot }, stdout: "pipe", stderr: "pipe" })
      const [code, stdout] = await Promise.all([run.exited, new Response(run.stdout).text()])
      return { code, report: JSON.parse(stdout) }
    }
    const changed = await check(csv)
    expect(changed.code).toBe(1)
    expect(changed.report.pass).toBe(false)
    const acceptance = await Bun.file(path.join(root, "acceptance.json")).json()
    await Bun.write(path.join(root, "acceptance.json"), JSON.stringify({ ...acceptance, required_type_fragments: ["DefinitelyWrongNode"] }))
    const wrongNode = await check(path.join(root, "oracle.csv"))
    expect(wrongNode.code).toBe(1)
    expect(wrongNode.report.problems.join(" ")).toContain("DefinitelyWrongNode")
  } finally { await rm(root, { recursive: true, force: true }) }
})
