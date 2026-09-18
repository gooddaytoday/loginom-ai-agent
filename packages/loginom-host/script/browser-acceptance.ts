import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { supervise } from "../src/supervisor"

// Linux acceptance with real pinned Chromium and a local authentication-page fixture.
// It proves browser startup/cleanup, not compatibility with a live Loginom server.
const resources = process.argv[2]
if (!resources || !isAbsolute(resources) || process.platform !== "linux")
  throw new Error("Provide an absolute Linux resource directory")
const headed = process.argv.includes("--headed")
const inspectWindows = headed || process.argv.includes("--window-check")
if (inspectWindows && !process.env.DISPLAY) throw Error("Headed acceptance requires an X11 display")
const windows = new Set<string>()
const cliRejection = process.argv.includes("--cli-rejection")
if (headed && cliRejection) throw Error("Setup validation is always headless; choose the direct runtime check")
const wrongIdentity = cliRejection || process.argv.includes("--wrong-identity")
const directory = await mkdtemp(join(tmpdir(), "loginom-browser-acceptance-"))
const observed = new Map<number, { renderer: boolean; seccomp: boolean; disabled: boolean }>()
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    if (request.method === "POST") {
      const message = (await request.json()) as {
        id?: string | number
        method?: string
        params?: { protocolVersion?: string }
      }
      if (message.id === undefined) return new Response(null, { status: 202 })
      return Response.json({
        jsonrpc: "2.0",
        id: message.id,
        result:
          message.method === "initialize"
            ? {
                protocolVersion: message.params?.protocolVersion,
                capabilities: {},
                serverInfo: { name: "local-browser-fixture", version: "1" },
              }
            : {},
      })
    }
    if (request.method !== "GET") return new Response(null, { status: 204 })
    await Bun.sleep(1000)
    return new Response(
      `<html><body><button data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">fixture</button><script>globalThis.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'fixture'}}}}}}};</script></body></html>`,
      { headers: { "Content-Type": "text/html" } },
    )
  },
})
const watch = { stopped: false }
const observer = (async () => {
  while (!watch.stopped) {
    const processList = Bun.spawn(["ps", "-eo", "pid=,args="], { stdout: "pipe", stderr: "ignore" })
    const lines = (await new Response(processList.stdout).text()).split("\n")
    await processList.exited
    for (const line of lines.filter((line) => line.includes(directory) && line.includes("--user-data-dir="))) {
      const pid = Number(line.trim().split(/\s/, 1)[0])
      const status = await readFile(`/proc/${pid}/status`, "utf8").catch(() => "")
      if (!status) continue
      observed.set(pid, {
        renderer: line.includes("--type=renderer"),
        seccomp: /^Seccomp:\s+2$/m.test(status),
        disabled: line.includes("--no-sandbox"),
      })
    }
    if (inspectWindows) {
      for (const id of await clientWindows()) {
        const property = Bun.spawn(["xprop", "-id", id, "_NET_WM_PID"], { stdout: "pipe", stderr: "ignore" })
        const text = await new Response(property.stdout).text()
        await property.exited
        const pid = Number(text.match(/=\s*(\d+)/)?.[1])
        if (!observed.has(pid)) continue
        const info = Bun.spawn(["xwininfo", "-id", id], { stdout: "pipe", stderr: "ignore" })
        const state = await new Response(info.stdout).text()
        await info.exited
        if (state.includes("Map State: IsViewable")) windows.add(id)
      }
    }
    await Bun.sleep(100)
  }
})()
try {
  const outcome = cliRejection
    ? await rejectSetup(resources, directory, `http://127.0.0.1:${server.port}/`)
    : await supervise({
        node: join(resources, "bin/node"),
        entry: join(resources, "runtime/src/managed-entry.mjs"),
        resources,
        stateDir: directory,
        generation: 1,
        chat: "browser-validation",
        validation: true,
        headless: !headed,
        endpoint: `http://127.0.0.1:${server.port}/mcp`,
        connection: {
          apiKey: "fixture-key",
          password: "",
          username: wrongIdentity ? "other" : "fixture",
          url: `http://127.0.0.1:${server.port}/`,
        },
        environment: { ...process.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" },
      }).then(
        async (child) => {
          await child.close()
          return { validation: child.ready }
        },
        (error: Error) => ({ error: error.message }),
      )
  watch.stopped = true
  await observer
  const alive = []
  for (const pid of observed.keys()) {
    if (await Bun.file(`/proc/${pid}/status`).exists()) alive.push(pid)
  }
  const sandbox =
    [...observed.values()].some((item) => item.renderer && item.seccomp) &&
    ![...observed.values()].some((item) => item.disabled)
  const remainingWindows = inspectWindows ? (await clientWindows()).filter((id) => windows.has(id)) : []
  const result = {
    directory,
    headed,
    visibleWindows: [...windows],
    remainingWindows,
    browserProcesses: observed.size,
    sandbox,
    alive,
    ...outcome,
  }
  console.log(JSON.stringify(result))
  if (
    (headed && !windows.size) ||
    (inspectWindows && !headed && windows.size > 0) ||
    remainingWindows.length > 0 ||
    !observed.size ||
    !sandbox ||
    alive.length ||
    (wrongIdentity ? !("error" in outcome) || outcome.error !== "LOGINOM_ACCOUNT_MISMATCH" : "error" in outcome)
  )
    throw new Error("LOGINOM_BROWSER_ACCEPTANCE_FAILED")
} finally {
  watch.stopped = true
  await observer
  server.stop(true)
  await rm(directory, { recursive: true, force: true })
}

async function rejectSetup(resources: string, directory: string, url: string) {
  // Isolated development bundle: only its manifest endpoint changes. Original artifact stays intact.
  const bundle = join(directory, "bundle")
  const profile = join(directory, "profile")
  await cp(resources, bundle, { recursive: true, dereference: false, verbatimSymlinks: true })
  const manifest = await Bun.file(join(bundle, "resource-manifest.json")).json()
  await Bun.write(join(bundle, "resource-manifest.json"), JSON.stringify({ ...manifest, endpoint: url + "mcp" }))
  const child = Bun.spawn(
    [resolve(resources, "../../bin/loginom-ai-agent-cli"), "loginom", "setup", "--stdin-json", "--format", "json"],
    {
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "LOGINOM_AI_AGENT_CLI_BUNDLE")),
        LOGINOM_AI_AGENT_CLI_PROFILE: profile,
        LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
      stdin: new Blob([JSON.stringify({ apiKey: "fixture-key", password: "", username: "other", url })]),
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  const code = await child.exited
  const output = await stdout
  const diagnostics = await stderr
  const guard = (await readdir(profile)).includes(".writer")
  if (code !== 1 || guard || output.includes("fixture-key") || diagnostics.includes("fixture-key"))
    throw new Error("LOGINOM_CLI_REJECTION_FAILED")
  return { error: (JSON.parse(output) as { code: string }).code, exit: code, guard }
}

async function clientWindows() {
  const child = Bun.spawn(["xprop", "-root", "_NET_CLIENT_LIST"], { stdout: "pipe", stderr: "pipe" })
  const output = await new Response(child.stdout).text()
  if ((await child.exited) !== 0) throw Error("Cannot inspect X11 client windows")
  return output.match(/0x[0-9a-f]+/gi) ?? []
}
