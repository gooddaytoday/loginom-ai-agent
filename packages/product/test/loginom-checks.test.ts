import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"

// Product tests on Linux (B5.1m): test.yml runs the product packages, check-test.yml leaves them out of `turbo test`.
// A package in both runs twice; a package in neither is never tested.
const root = resolve(import.meta.dir, "../../..")
const text = (path: string) => Bun.file(resolve(root, path)).text()

type Step = { name?: string; "working-directory"?: string; run?: string }
type Workflow = { on: { push?: { branches?: string[] }; pull_request?: { branches?: string[] } }; jobs: Record<string, { steps: Step[] }> }

const checks = Bun.YAML.parse(await text(".github/workflows/test.yml")) as Workflow
const checkTest = await text(".github/workflows/check-test.yml")

// Packages whose Bun tests test.yml runs: a step in packages/<dir> that runs `bun test` or `bun run test`.
const checked = await Promise.all(
  Object.values(checks.jobs)
    .flatMap((job) => job.steps)
    .filter((step) => /^packages\/[^/]+$/.test(step["working-directory"] ?? "") && /\bbun (run )?test\b/.test(step.run ?? ""))
    .map(async (step) => (Bun.JSONC.parse(await text(`${step["working-directory"]}/package.json`)) as { name: string }).name),
)

describe("loginom-checks (test.yml)", () => {
  test("runs on pushes to oc2-migration, the branch the fork first sees", () => {
    expect(checks.on.push?.branches).toContain("oc2-migration")
    expect(checks.on.pull_request?.branches).toEqual(["loginom"])
  })

  test("runs the five product packages", () => {
    expect(checked.sort()).toEqual(
      ["@loginom-ai-agent/dashboard", "@loginom-ai-agent/loginom-agent", "@loginom-ai-agent/loginom-host", "@loginom-ai-agent/product", "@opencode/cli"],
    )
  })
})

describe("check-test.yml exclusions", () => {
  const commands = checkTest.match(/bun turbo test [^\n]*/g) ?? []

  test("both the affected and the full unit run exist", () => {
    expect(commands).toHaveLength(2)
  })

  test("each unit run leaves out exactly the packages test.yml runs", () => {
    for (const command of commands) {
      const excluded = [...command.matchAll(/--filter='!([^']+)'/g)].map((match) => match[1]!)
      expect(excluded.sort()).toEqual([...checked].sort())
    }
  })
})
