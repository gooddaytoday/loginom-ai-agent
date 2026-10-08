import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot, repoRoot } from "../src/config"

const builder = path.join(evalsRoot, "skills/loginom-node-eval-case/scripts/reference-attempt.ts")

test("node skill: draft without reference runs one fake attempt and archives cleanup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "node-skill-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ result: { revision: "fixture" } }) })
  try {
    const draft = path.join(root, "group-sum-qty")
    await cp(path.join(evalsRoot, "tasks/group-sum-qty"), draft, { recursive: true })
    await rm(path.join(draft, "reference.lgp"))
    const env = { ...process.env, AGENT_REPO: repoRoot,
      EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_AGENT_VARIANT: "default",
      EVAL_PROFILE_DIR: path.join(root, "profile"), EVAL_WORKSPACE_ROOT: path.join(root, "work"),
      EVAL_RESULTS_DIR: path.join(root, "results"), EVAL_TASK_TIMEOUT_MS: "10000",
      EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`,
      LOGINOM_DOCK_API_KEY: "fixture-key", LOGINOM_URL: `http://127.0.0.1:${server.port}`,
      LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
      EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture",
      EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider", EVAL_AGENT_PROVIDER_MODEL_ID: "model" }
    const run = Bun.spawn([process.execPath, builder, draft, "1"], { env, stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()])
    expect(stderr).toBe("")
    expect(code).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.result).toMatchObject({ task_id: "group-sum-qty", attempt: 1, status: "completed",
      environment_cleanup: { status: "confirmed" }, judge_status: "skipped" })
    expect(await Bun.file(path.join(report.attempt_dir, "artifact/package.lgp")).exists()).toBe(true)
    expect(await Bun.file(path.join(root, "profile.harness-lease/owner.json")).exists()).toBe(false)
    expect(await Bun.file(path.join(draft, "reference.lgp")).exists()).toBe(false)
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
}, 30000)
