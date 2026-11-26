import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { trackedSnapshot } from "./tracked"

// B5.1f: the pty build workflow and its setup action carry the pins that make the binary portable (glibc 2.30 on
// Linux, baseline CPU, static CRT on Windows). Nothing else runs them before CI, so the pins are guarded here.
const { read } = trackedSnapshot(resolve(import.meta.dir, "../../.."))
const workflow = read(".github/workflows/loginom-pty.yml")
const action = read(".github/actions/setup-rust-pty/action.yml")
const doc: any = (Bun as any).YAML.parse(workflow)
const job = doc.jobs.pty

describe("loginom-pty workflow", () => {
  test("builds the three product platforms as separate artifacts", () => {
    expect(JSON.parse(doc.env.ALL_TARGETS)).toEqual([
      "x86_64-unknown-linux-gnu",
      "aarch64-apple-darwin",
      "x86_64-pc-windows-msvc",
    ])
    expect(doc.on.workflow_call.inputs.targets.default).toBe("")
    // Only targets without a cached binary are built; the plan job reads the input and falls back to all three.
    expect(job.strategy.matrix.target).toBe("${{ fromJSON(needs.plan.outputs.missing) }}")
    expect(workflow).toContain('echo "all=${REQUESTED:-$ALL_TARGETS}"')
    expect(doc.jobs.plan.steps.find((step: any) => step.id === "targets").env.REQUESTED).toBe("${{ inputs.targets }}")
    expect(job["runs-on"]).toContain("contains(matrix.target, 'linux') && 'ubuntu-22.04'")
    expect(job["runs-on"]).toContain("contains(matrix.target, 'apple') && 'macos-15'")
    expect(job["runs-on"]).toContain("|| 'windows-2022'")
    expect(workflow).toContain("name: loginom-ai-agent-pty-${{ matrix.target }}")
    expect(Object.keys(doc.on)).toContain("workflow_call")
  })

  test("Linux is linked against glibc 2.30 and verified with readelf", () => {
    expect(doc.env.GNU_GLIBC_VERSION).toBe("2.30")
    expect(workflow).toContain('cargo zigbuild --locked --release --target "${{ matrix.target }}.$GNU_GLIBC_VERSION"')
    expect(workflow).toContain("readelf --version-info")
  })

  test("the smoke step checks the product name, a play session and the shipped artifact", () => {
    expect(workflow).toContain('"loginom-ai-agent-pty $version (protocol $protocol)"')
    expect(workflow).toContain('play --runtime-dir "$runtime" --name smoke')
    expect(workflow).toContain("if-no-files-found: error")
    expect(workflow).not.toContain("opencode-pty")
  })

  test("the setup action pins the toolchains the package pins", () => {
    const toolchain = /channel = "([^"]+)"/.exec(read("packages/process-daemon/rust-toolchain.toml"))?.[1]
    expect(action).toContain(`rustup toolchain install ${toolchain} `)
    expect(action).toContain("version: 0.16.0")
    expect(action).toContain("OPENCODE_ZIG_CPU=baseline")
    expect(action).toContain("target-feature=+crt-static")
    expect(action).toContain("OPENCODE_REAL_ZIG")
  })

  test("the upstream process-daemon check runs on a hosted macOS runner and expects the product name", () => {
    const check = read(".github/workflows/check-process-daemon.yml")
    expect(check).not.toContain("blacksmith")
    expect(check).toContain("macos-15")
    expect(check).not.toContain("opencode-pty")
  })

  test("each candidate builds only its own platform's pty", () => {
    const own = { linux: "x86_64-unknown-linux-gnu", macos: "aarch64-apple-darwin", windows: "x86_64-pc-windows-msvc" }
    for (const [name, target] of Object.entries(own)) {
      const consumer: any = (Bun as any).YAML.parse(read(`.github/workflows/loginom-${name}.yml`))
      expect(consumer.jobs.pty.with.targets).toBe(JSON.stringify([target]))
      expect(read(`.github/workflows/loginom-${name}.yml`)).toContain(`name: loginom-ai-agent-pty-${target}`)
    }
  })

  test("a cached target never starts a build runner and is published as the same artifact", () => {
    expect(doc.jobs.plan["runs-on"]).toBe("ubuntu-24.04")
    expect(doc.jobs.reuse["runs-on"]).toBe("ubuntu-24.04")
    expect(doc.jobs.reuse.strategy.matrix.target).toBe("${{ fromJSON(needs.plan.outputs.cached) }}")
    expect(doc.jobs.reuse.if).toBe("needs.plan.outputs.cached != '[]'")
    expect(job.if).toBe("needs.plan.outputs.missing != '[]'")
    const upload = (name: string) =>
      doc.jobs[name].steps.find((step: any) => step.uses?.startsWith("actions/upload-artifact@")).with.name
    expect(upload("reuse")).toBe(upload("pty"))
    expect(upload("pty")).toBe("loginom-ai-agent-pty-${{ matrix.target }}")
    // The lookup never downloads, and a restore on a hit must not fall through to an empty artifact.
    const lookups = doc.jobs.plan.steps.filter((step: any) => step.uses?.startsWith("actions/cache/restore@"))
    expect(lookups).toHaveLength(3)
    for (const step of lookups) expect(step.with["lookup-only"]).toBe(true)
    const restore = doc.jobs.reuse.steps.find((step: any) => step.uses?.startsWith("actions/cache/restore@"))
    expect(restore.with["fail-on-cache-miss"]).toBe(true)
  })

  test("the cache key covers every input of the binary and the target, and is saved only after the smoke test", () => {
    const hash = doc.jobs.plan.steps.find((step: any) => step.id === "hash").run
    for (const input of [
      "packages/process-daemon/**",
      "packages/process-daemon/Cargo.lock",
      ".github/actions/setup-rust-pty/**",
      ".github/workflows/loginom-pty.yml",
    ])
      expect(hash).toContain(`'${input}'`)
    const targets = ["x86_64-unknown-linux-gnu", "aarch64-apple-darwin", "x86_64-pc-windows-msvc"]
    const keys = doc.jobs.plan.steps.filter((step: any) => step.with?.key).map((step: any) => step.with.key)
    expect(keys).toEqual(targets.map((target) => `pty-${target}-` + "${{ steps.hash.outputs.value }}"))
    const save = doc.jobs.pty.steps.findIndex((step: any) => step.uses?.startsWith("actions/cache/save@"))
    const shared = "pty-${{ matrix.target }}-${{ needs.plan.outputs.hash }}"
    expect(doc.jobs.pty.steps[save].with.key).toBe(shared)
    expect(doc.jobs.reuse.steps.find((step: any) => step.with?.key).with.key).toBe(shared)
    expect(save).toBeGreaterThan(doc.jobs.pty.steps.findIndex((step: any) => step.name === "Smoke test"))
    for (const step of [...doc.jobs.plan.steps, ...doc.jobs.reuse.steps, doc.jobs.pty.steps[save]])
      if (step.with?.key) expect(step.with.enableCrossOsArchive).toBe(true)
  })
})
