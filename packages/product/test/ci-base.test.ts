import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"

// The fork's base CI (B5.1c): typecheck and unit tests run on GitHub-hosted runners for pull requests into `loginom`,
// and the upstream-only jobs (paid runners, e2e) are off.
const root = resolve(import.meta.dir, "../../..")
const upstream = "github.repository == 'anomalyco/opencode'"

type Job = { if?: string; "runs-on"?: string; strategy?: { matrix?: { settings?: unknown } } }
type Workflow = { on: Record<string, { branches?: string[] }>; jobs: Record<string, Job> }
const workflow = async (name: string) => Bun.YAML.parse(await Bun.file(resolve(root, ".github/workflows", name)).text()) as Workflow

describe("check.yml", async () => {
  const check = await workflow("check.yml")
  test("typechecks pull requests into loginom on a hosted runner", () => {
    expect(check.on.pull_request?.branches).toContain("loginom")
    expect(check.jobs.check?.["runs-on"]).toBe("ubuntu-24.04")
  })
})

describe("check-test.yml", async () => {
  const test_ = await workflow("check-test.yml")
  test("runs only for pull requests into loginom", () => {
    expect(test_.on.pull_request?.branches).toEqual(["loginom"])
  })
  test("unit runs on Linux only, on a hosted runner", () => {
    const matrix = JSON.stringify(test_.jobs.unit?.strategy?.matrix?.settings)
    expect(matrix).toContain("ubuntu-24.04")
    expect(matrix).not.toContain("windows")
    expect(matrix).not.toContain("blacksmith")
  })
  test("affected, build and e2e stay upstream-only", () => {
    for (const name of ["affected", "build", "e2e", "e2e-suite"]) expect(test_.jobs[name]?.if).toContain(upstream)
  })
  test("unit is not upstream-only", () => {
    expect(test_.jobs.unit?.if ?? "").not.toContain(upstream)
  })
})

describe("turbo.json", () => {
  test("passes the pinned Node through to the packages that spawn it", async () => {
    const turbo = Bun.JSONC.parse(await Bun.file(resolve(root, "turbo.json")).text()) as {
      tasks: Record<string, { passThroughEnv?: string[]; dependsOn?: string[] }>
    }
    for (const name of ["@loginom-ai-agent/loginom-host", "@loginom-ai-agent/dashboard"]) {
      expect(turbo.tasks[`${name}#test`]?.passThroughEnv).toContain("LOGINOM_AI_AGENT_TEST_NODE")
      expect(turbo.tasks[`${name}#test`]?.dependsOn).toEqual(["transit"])
    }
  })
})
