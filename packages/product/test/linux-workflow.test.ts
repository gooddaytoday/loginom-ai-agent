import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { trackedSnapshot } from "./tracked"

// B5.1h: the Linux candidate workflow. Nothing runs it before CI, so the order that matters is guarded here: the pty
// first, the product CLI verified, the Desktop build refused without the CLI, and no secrets.
const { read } = trackedSnapshot(resolve(import.meta.dir, "../../.."))
const workflow = read(".github/workflows/loginom-linux.yml")
const doc: any = (Bun as any).YAML.parse(workflow)
const steps: string[] = doc.jobs.linux.steps.map((step: any) => step.name ?? step.uses)

describe("loginom-linux workflow", () => {
  test("is called from the release workflow and does not also build on its own push", () => {
    expect(Object.keys(doc.on).sort()).toEqual(["workflow_call", "workflow_dispatch"])
  })

  test("takes the pty from loginom-pty.yml and embeds it", () => {
    expect(doc.jobs.pty.uses).toBe("./.github/workflows/loginom-pty.yml")
    expect(doc.jobs.linux.needs).toBe("pty")
    expect(workflow).toContain("name: loginom-ai-agent-pty-x86_64-unknown-linux-gnu")
    expect(workflow).toContain("LOGINOM_AI_AGENT_PTY_BIN=")
  })

  test("builds the product CLI, verifies it, then proves Desktop needs the CLI before building it", () => {
    const order = ["Build the product CLI", "Verify the CLI candidate and run it", "Desktop build refuses to run without the CLI", "Build the CLI that Desktop bundles", "Build Desktop", "Package Desktop"]
    const at = order.map((name) => steps.indexOf(name))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect(at).toEqual([...at].sort((left, right) => left - right))
    expect(workflow).toContain("verify-cli-candidate.ts")
    expect(workflow).toContain("LOGINOM_AI_AGENT_TARGET: linux-x64-baseline")
  })

  test("runs the safeStorage smoke against the codec Host owns, and carries no secrets", () => {
    expect(workflow).toContain("packages/loginom-host/src/connection/credentials.ts")
    expect(workflow).not.toContain("secrets.")
  })
})
