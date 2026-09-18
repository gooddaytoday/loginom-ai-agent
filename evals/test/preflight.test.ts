import { expect, test } from "bun:test"
import path from "node:path"
import { evalsRoot, loadConfig } from "../src/config"
import { parseArtifactSource } from "../src/artifact"
import { EvalFailure } from "../src/fail"
import { dockSkillRevision, preflight } from "../src/preflight"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

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
