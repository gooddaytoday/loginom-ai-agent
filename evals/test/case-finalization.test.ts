import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"

async function attempt(confirmed: boolean) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-finalize-"))
  const caseDir = path.join(root, "case")
  const attemptDir = path.join(root, "attempt-1")
  await Bun.write(path.join(caseDir, "reference.lgp"), "previous reference")
  await Bun.write(path.join(caseDir, "provenance.json"), '{"retained":true}\n')
  await Bun.write(path.join(attemptDir, "package.lgp"), await Bun.file(path.join(evalsRoot, "fixtures/calibration/sales-by-category/reference.lgp")).bytes())
  await Bun.write(`${attemptDir}.case`, caseDir)
  await Bun.write(path.join(attemptDir, "name"), "case-1")
  await Bun.write(path.join(attemptDir, "started-at"), "2026-01-01T00:00:00Z")
  await Bun.write(path.join(attemptDir, "finished-at"), "2026-01-01T00:00:01Z")
  await Bun.write(path.join(attemptDir, "exit-code"), "0")
  await Bun.write(path.join(attemptDir, "summary.json"), JSON.stringify({
    modelConfirmed: confirmed,
    models: [{ providerID: "provider-a", modelID: "model-a", variant: "high" }],
    expectedModel: { providerID: "provider-a", modelID: "model-a", variant: "high" },
  }))
  await Bun.write(path.join(attemptDir, "storage.json"), JSON.stringify({ input_matches_dataset: true, package: "case.lgp", origin: "receipt", inputs: [] }))
  for (const file of ["check.json", "check-rerun.json"]) await Bun.write(path.join(attemptDir, file), '{"pass":true}')
  await Bun.write(path.join(root, "settings"), Object.entries({
    AGENT_REPO: path.dirname(evalsRoot), CLI: process.execPath, PROFILE: path.join(root, "profile"),
    LOGINOM_URL: "https://loginom.example.invalid", LOGINOM_USERNAME: "fixture", LOGINOM_CONTAINER: "fixture",
    LOGINOM_STORAGE: "/fixture", ATTEMPT_TIMEOUT_S: "1", WORK_ROOT: root, MODEL: "provider-b/model-b", VARIANT: "low",
  }).map(([key, value]) => `${key}=${value}`).join("\n"))
  const proc = Bun.spawn(["python3", "-B", path.join(evalsRoot, "skills/loginom-eval-case/scripts/finalize_case.py"), caseDir, attemptDir,
    "--scenario-url", "https://loginom.example.invalid"], {
    env: { ...process.env, LOGINOM_EVAL_CASE_ENV: path.join(root, "settings") }, stdout: "pipe", stderr: "pipe",
  })
  const errors = await new Response(proc.stderr).text()
  await new Response(proc.stdout).text()
  return { root, caseDir, code: await proc.exited, errors }
}

test("finalization records the confirmed attempt model after settings change", async () => {
  const result = await attempt(true)
  try {
    expect({ code: result.code, errors: result.errors }).toEqual({ code: 0, errors: "" })
    const provenance = await Bun.file(path.join(result.caseDir, "provenance.json")).json()
    expect(provenance.model).toEqual({ id: "provider-a/model-a", variant: "high", confirmed_in_session_db: true })
  } finally { await rm(result.root, { recursive: true, force: true }) }
})

test("finalization refuses an unconfirmed model before changing the case", async () => {
  const result = await attempt(false)
  try {
    expect(result.code).not.toBe(0)
    expect(result.errors).toContain("model_confirmed")
    expect(await Bun.file(path.join(result.caseDir, "reference.lgp")).text()).toBe("previous reference")
    expect(await Bun.file(path.join(result.caseDir, "provenance.json")).json()).toEqual({ retained: true })
  } finally { await rm(result.root, { recursive: true, force: true }) }
})
