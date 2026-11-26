import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { trackedSnapshot } from "./tracked"

// B5.1i: the Windows candidate builds on a runner nothing else exercises before CI. The order that Desktop requires
// (the CLI in packages/cli/dist before the Desktop build, the unpacked app before the installer) is guarded here.
const { read, paths } = trackedSnapshot(resolve(import.meta.dir, "../../.."))
const script = read("script/build-windows.ps1")
const doc: any = (Bun as any).YAML.parse(read(".github/workflows/loginom-windows.yml"))

describe("build-windows.ps1", () => {
  test("names only packages and scripts of this repository", () => {
    expect(script).not.toContain("package:win")
    expect(script).not.toMatch(/--filter", "(opencode|@opencode-ai\/desktop)"/)
    for (const filter of ["@opencode/desktop", "@opencode/cli", "@loginom-ai-agent/loginom-host"])
      expect(script).toContain(`"--filter", "${filter}"`)
  })

  test("builds the Desktop CLI, then Desktop, then the installer around the unpacked app", () => {
    const order = [
      'LOGINOM_AI_AGENT_TARGET = "windows-x64-baseline"',
      '"script/build.ts", "--skip-install"',
      '-Arguments @("run", "build")',
      '-Arguments @("run", "pack")',
      "LOGINOM_AI_AGENT_DESKTOP_APP = $unpacked",
      '"script/build-cli.ts"',
    ].map((text) => script.indexOf(text))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(script.lastIndexOf('-Arguments @("run", "pack")')).toBeGreaterThan(order[4]!)
  })

  test("both CLI builds embed the pty from loginom-pty.yml", () => {
    expect(script).toContain("$env:LOGINOM_AI_AGENT_PTY_BIN = $pty")
    const steps: any[] = doc.jobs["build-package-test"].steps
    expect(doc.jobs["build-package-test"].needs).toBe("pty")
    expect(doc.jobs.pty.uses).toBe("./.github/workflows/loginom-pty.yml")
    const download = steps.findIndex((step) => step.with?.name === "loginom-ai-agent-pty-x86_64-pc-windows-msvc")
    const build = steps.findIndex((step) => step.run?.includes("build-windows.ps1"))
    expect(download).toBeGreaterThan(-1)
    expect(build).toBeGreaterThan(download)
    expect(steps[build].run).toContain("loginom-ai-agent-pty.exe")
  })

  test("can be dispatched and called, and uploads the candidates before the installed checks", () => {
    expect(Object.keys(doc.on)).toEqual(expect.arrayContaining(["workflow_call", "workflow_dispatch"]))
    const names: string[] = doc.jobs["build-package-test"].steps.map((step: any) => step.name ?? "")
    expect(names.indexOf("Upload short-lived unsigned candidates")).toBeGreaterThan(-1)
    expect(names.indexOf("Upload short-lived unsigned candidates")).toBeLessThan(
      names.indexOf("Install, execute and remove the CLI ZIP candidate"),
    )
  })
})

// B5.1j: the installed-product steps only ever ran on 0.4 scripts; each name they use must exist in v2.
describe("installed-product checks", () => {
  const steps: any[] = doc.jobs["build-package-test"].steps
  const run = (name: string): string => steps.find((step) => step.name === name).run

  test("safeStorage uses the credential codec of loginom-host, which exports `credentials`", () => {
    const text = run("Desktop safeStorage DPAPI across Electron restarts")
    expect(text).toContain("build packages/loginom-host/src/connection/credentials.ts")
    expect(read("packages/loginom-host/src/connection/credentials.ts")).toContain("export function credentials")
  })

  test("package test files named by the workflow are tracked", () => {
    const text = run("Run package-local checks")
    const named = [...text.matchAll(/(?:test(?:\/|\\)loginom(?:\/|\\)|\btest |\s)((?:src|scripts|test)[\w./-]*\.test\.(?:ts|mjs)|electron-builder\.config\.test\.ts)/g)]
    expect(named.length).toBeGreaterThan(8)
    const missing = named.filter((match) => !paths.some((path) => path.endsWith(match[1]!)))
    expect(missing.map((match) => match[1])).toEqual([])
  })

  test("the installed smoke gets only parameters it declares, as a child with a deadline, and the red run is a declared mutation", () => {
    const smoke = read("packages/desktop/test/loginom/windows-installed-smoke.ps1")
    const declared = new Set([...(smoke.match(/param\(([\s\S]*?)\n\)/)?.[1] ?? "").matchAll(/\$([A-Za-z]+)\s*(?:=|,|\n|$)/g)].map((m) => m[1]!.toLowerCase()))
    const calls = run("Install, launch and uninstall Desktop candidate")
    const passed = [...calls.match(/'-File'[^\n]*\n?[^\n]*/)![0].matchAll(/'-([A-Za-z]+)'/g), ...calls.matchAll(/@\('-([A-Za-z]+)'/g)]
      .map((m) => m[1]!.toLowerCase())
      .filter((name) => !["nologo", "noprofile", "noninteractive", "file"].includes(name))
    expect(passed).toEqual(expect.arrayContaining(["installer", "runroot", "expectedversion", "channel", "allowserver", "allowadministrator", "mutation"]))
    expect(passed.filter((name) => !declared.has(name))).toEqual([])
    expect(smoke).toContain(`'${calls.match(/'-Mutation', '(\w+)'/)![1]}'`)
    expect(calls).toContain("WaitForExit(720000)")
    expect(calls).toContain("Remove-Leftover \"before $Name\"")
    expect(smoke).toContain("if ($observation.status -ne 'PASS') { break }")
  })

  test("the profile directories cleared before a smoke run are the ones its clean-profile check reads", () => {
    const smoke = read("packages/desktop/test/loginom/windows-installed-smoke.ps1")
    const calls = run("Install, launch and uninstall Desktop candidate")
    expect(smoke).toContain("$userData = Join-Path $env:APPDATA $appId")
    expect(smoke).toContain('$serviceData = Join-Path $env:USERPROFILE ".local\\share\\$slug"')
    expect(calls).toContain("(Join-Path $env:APPDATA 'com.loginom.aiagent.dev')")
    expect(calls).toContain("'.local\\share\\loginom-ai-agent-dev'")
    expect(calls).toContain('Clear-Profile "before $Name"')
    expect(smoke).toContain("Check 'clean-profile' (-not (Test-Path -LiteralPath $userData) -and -not (Test-Path -LiteralPath $serviceData))")
  })
})
