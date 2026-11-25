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
    const all = ["x86_64-unknown-linux-gnu", "aarch64-apple-darwin", "x86_64-pc-windows-msvc"]
    expect(job.strategy.matrix.target).toBe(`\${{ fromJSON(inputs.targets || '${JSON.stringify(all)}') }}`)
    expect(doc.on.workflow_call.inputs.targets.default).toBe("")
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
})
