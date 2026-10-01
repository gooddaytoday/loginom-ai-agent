import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises"
import os from "node:os"
import { evalsRoot, loadConfig } from "../src/config"
import { parseArtifactSource } from "../src/artifact"
import { EvalFailure } from "../src/fail"
import { agentInfo, checkFreeSpace, checkStorage, dockSkillRevision, preflight } from "../src/preflight"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("agentInfo: binary идентифицируется по реальному файлу и манифесту сборки", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-agent-identity-"))
  try {
    const binary = path.join(dir, "release", "bin", "loginom-ai-agent-cli")
    await mkdir(path.dirname(binary), { recursive: true })
    await Bun.write(binary, "abc")
    await Bun.write(path.join(dir, "release", "cli-manifest.json"), JSON.stringify({
      metadata: { version: "0.1.17", sourceCommit: "a".repeat(40), sourceDirty: false, sourceTreeSha256: "b".repeat(64) },
    }))
    await symlink(binary, path.join(dir, "current-cli"))
    const config = loadConfig(["--skip-judge"], {
      LOGINOM_DOCK_API_KEY: "k", EVAL_AGENT_MODEL: "m/x", EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: path.join(dir, "current-cli"),
    })
    expect(await agentInfo(config)).toEqual({
      cliVersion: "0.1.17", binaryPath: binary,
      binarySha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      sourceCommit: "a".repeat(40), sourceDirty: false, sourceTreeSha256: "b".repeat(64),
    })
    await Bun.write(binary, "abcd")
    expect((await agentInfo(config)).binarySha256).not.toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("preflight: dry-run проверяет только фикстуры и читает git", async () => {
  const config = loadConfig(["--dry-run"], {})
  const environment = await preflight(config, parseArtifactSource(config.artifactSource, config.loginom))
  expect(environment.git?.sha).toMatch(/^[0-9a-f]{7,}$/)
  expect(environment.codex).toBeNull()
  expect(environment.dock).toBeNull()
  expect(environment.loginom).toBeNull()
})

test("preflight: --judge-only проверяет только судью и не трогает Loginom/docker", async () => {
  const config = loadConfig(["--judge-only", "run-1"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge })
  const environment = await preflight(config, parseArtifactSource("docker", config.loginom))
  expect(environment.codex?.version).toBe("fake-codex 0.0.0")
  expect(environment.loginom).toBeNull()
})

test("checkStorage: существующий dir: проходит, отсутствующий — EvalFailure с кодом 2", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-storage-"))
  const docker = { container: "c", storageDir: "/s" }
  await checkStorage(parseArtifactSource(`dir:${dir}`, docker))
  const missing = `dir:${path.join(dir, "missing")}`
  const rejected = await checkStorage(parseArtifactSource(missing, docker)).catch((error: unknown) => error)
  expect(rejected).toBeInstanceOf(EvalFailure)
  expect((rejected as EvalFailure).exitCode).toBe(2)
  expect((rejected as EvalFailure).message).toContain("Хранилище Loginom недоступно")
})

test("checkFreeSpace: проверяет реальное свободное место перед прогоном", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-free-space-"))
  try {
    await expect(checkFreeSpace(dir)).resolves.toBeUndefined()
    const error = await checkFreeSpace(dir, Number.MAX_SAFE_INTEGER).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(EvalFailure)
    expect((error as EvalFailure).exitCode).toBe(2)
    expect((error as EvalFailure).message).toContain("Недостаточно свободного места")
    expect((error as EvalFailure).message).toContain(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("preflight: недоступный судья — EvalFailure", async () => {
  const config = loadConfig(["--judge-only", "run-1"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: "/nonexistent/codex" })
  await expect(preflight(config, parseArtifactSource("docker", config.loginom))).rejects.toThrow("Судья недоступен")
})

test("dockSkillRevision: читает result.revision и падает без revision", async () => {
  const apiKey = "eval-dock-test-key-not-for-leak"
  let payload: object = { status: "ok", result: { revision: "r1" } }
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/health") return new Response("ok", { status: 200 })
      if (url.pathname === "/api/v1/skills/loginom-automation") return Response.json(payload)
      return new Response("not found", { status: 404 })
    },
  })
  const dock = { apiKey, baseUrl: `http://127.0.0.1:${server.port}` }
  try {
    expect(await dockSkillRevision(dock)).toBe("r1")
    payload = { status: "ok", result: {} }
    const rejected = await dockSkillRevision(dock).catch((error: unknown) => error)
    expect(rejected).toBeInstanceOf(EvalFailure)
    expect((rejected as EvalFailure).exitCode).toBe(2)
    expect((rejected as EvalFailure).message).toContain("Манифест skill без revision")
    expect((rejected as EvalFailure).message).not.toContain(apiKey)
  } finally {
    server.stop()
  }
})
