import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { trackedSnapshot } from "./tracked"

// B5.2b: the release candidate workflow. Nothing runs it before CI, so what it calls, what it waits for, the artifact
// names it downloads and the G5 steps are guarded here. Publication is stage G and is not in this file.
const { read } = trackedSnapshot(resolve(import.meta.dir, "../../.."))
const workflow = read(".github/workflows/loginom-release.yml")
const doc: any = (Bun as any).YAML.parse(workflow)
const stepNames = (job: string): string[] => doc.jobs[job].steps.map((step: any) => step.name ?? step.uses)
const platforms = [
  ["linux", "verify-linux"],
  ["windows", "verify-windows"],
  ["macos", "verify-macos"],
] as const

describe("loginom-release workflow", () => {
  test("runs as a candidate on dispatch and on the migration branch, and as a release on a v* tag", () => {
    expect(Object.keys(doc.on).sort()).toEqual(["push", "workflow_dispatch"])
    expect(doc.on.push.branches).toEqual(["oc2-migration"])
    expect(doc.on.push.tags).toEqual(["v*"])
    expect(doc.on.push.paths).toEqual(
      expect.arrayContaining([".github/workflows/loginom-release.yml", "packages/desktop/scripts/release/**"]),
    )
  })

  test("calls the three platform workflows after planning the version, and none else", () => {
    const calls = Object.entries(doc.jobs).flatMap(([name, job]: [string, any]) => (job.uses ? [[name, job.uses]] : []))
    expect(calls).toEqual([
      ["linux", "./.github/workflows/loginom-linux.yml"],
      ["windows", "./.github/workflows/loginom-windows.yml"],
      ["macos", "./.github/workflows/loginom-macos.yml"],
    ])
    for (const [name] of calls) expect([doc.jobs[name].needs].flat()).toContain("plan")
    expect(doc.jobs.macos.with.version).toBe("${{ needs.plan.outputs.version }}")
    expect(doc.jobs.plan.steps.at(-1).run).toContain('"$GITHUB_REF_NAME" != "v$version"')
  })

  test.each(platforms)("%s is verified on its own platform after its build", (platform, job) => {
    expect(doc.jobs[job].needs).toEqual(["plan", platform])
    const order = [
      "Install Electron",
      "Write the manifest and verify every installer against it",
      "G5, resources are complete and the check is red without a file",
      "G5 mutation, an undamaged copy turns the control red",
    ]
    const at = order.map((name) => stepNames(job).indexOf(name))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect(at).toEqual([...at].sort((left, right) => left - right))
    const steps = doc.jobs[job].steps.map((step: any) => step.run ?? "").join("\n")
    expect(steps).toContain(`candidate.ts prepare --platform ${platform}`)
    expect(steps).toContain(`candidate.ts g5 --platform ${platform}`)
    expect(steps).toContain("--undamaged")
  })

  test("downloads the artifacts the platform workflows upload", () => {
    const upload = (file: string) => read(`.github/workflows/${file}`)
    expect(upload("loginom-linux.yml")).toContain("name: loginom-linux-x64-desktop")
    expect(upload("loginom-linux.yml")).toContain("name: loginom-linux-x64-cli")
    expect(workflow).toContain("pattern: loginom-linux-x64-*")
    expect(upload("loginom-windows.yml")).toContain("name: loginom-windows-unsigned-${{ github.run_id }}")
    expect(workflow).toContain("name: loginom-windows-unsigned-${{ github.run_id }}")
    expect(upload("loginom-macos.yml")).toContain("name: loginom-macos15-arm64-${{ github.run_number }}")
    expect(workflow).toContain("name: loginom-macos15-arm64-${{ github.run_number }}")
  })

  test("the Linux job also runs cli-resources.test.ts", () => {
    expect(workflow).toContain("bun test --timeout 60000 test/cli-resources.test.ts")
  })

  test("SHA256SUMS.txt is written only after all three platforms are verified", () => {
    expect(doc.jobs.collect.needs).toEqual(["verify-linux", "verify-windows", "verify-macos"])
    expect(workflow).toContain("scripts/release/sums.ts")
    expect(doc.jobs.collect.steps.map((step: any) => step.with?.pattern).filter(Boolean)).toEqual(["loginom-release-*"])
  })

  test("publishes nothing and carries no secrets", () => {
    expect(workflow).not.toContain("secrets.")
    expect(doc.permissions).toEqual({ contents: "read" })
    expect(workflow).not.toMatch(/gh release|contents: write|draft|gh-release/)
  })
})
