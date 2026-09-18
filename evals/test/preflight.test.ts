import { expect, test } from "bun:test"
import path from "node:path"
import { evalsRoot, loadConfig } from "../src/config"
import { parseArtifactSource } from "../src/artifact"
import { preflight } from "../src/preflight"

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
