import { test, expect } from "bun:test"
import { readFile } from "node:fs/promises"
import vm from "node:vm"
import { EventEmitter } from "node:events"
import { LoginomHost } from "../src/adapter"
import { mintOriginalRunControl } from "../src/original-run-control"

// Actual entry/adapter; parser/backend services are doubles. No model or browser.
const source = await readFile(new URL("../../agent/src/cli/standalone-run.ts", import.meta.url), "utf8")
const code = new Bun.Transpiler({ loader: "ts" }).transformSync(
  source.replace(/^import .*\n/gm, "").replace(/await import\(([^)]+)\)/g, "await load($1)")
    .replace("export async function", "async function"),
)

test("ordinary CLI keeps original control and releases after host close without diagnostic capture", async () => {
  const events: string[] = []
  const messages = new EventEmitter()
  const controller = new AbortController()
  const control = mintOriginalRunControl(controller.signal, Date.now() + 7200_000)
  const host = {
    port: {
      on: messages.on.bind(messages), off: messages.off.bind(messages), start() {},
      postMessage(message: { id: string; method: string }) {
        events.push(message.method)
        if (!["acquire", "release"].includes(message.method)) throw Error("unexpected capture or mutation")
        queueMicrotask(() => messages.emit("message", { data: {
          id: message.id, result: message.method === "acquire" ? { generation: 7 } : {},
        } }))
      },
    },
    request: async () => ({ state: "ready", hasApiKey: true, recoveries: [] }),
    close: async () => { events.push("host-close") },
  }
  const parser: Record<string, unknown> = {}
  for (const name of ["scriptName", "parserConfiguration", "exitProcess", "help", "version", "strict", "fail", "command"])
    parser[name] = () => parser
  parser.parseAsync = async () => {
    events.push("parse")
    const lease = await LoginomHost.acquire("ordinary-chat")
    await lease!.release()
    events.push("parsed")
  }
  const load = async (name: string) => {
    if (name === "yargs") return { default: () => parser }
    if (name === "./standalone-proxy") return { applyCliSystemProxy: async () => {}, systemProxyNoticeLine: () => "" }
    if (name === "../effect/app-runtime") return { AppRuntime: { dispose: async () => { events.push("dispose") } } }
    if (name.includes("httpapi/server")) return { HttpApiApp: { webHandler: { loaded: () => false } } }
    if (name === "./cmd/run") return { RunCommand: {} }
    throw Error("unexpected import " + name)
  }
  const runtime = vm.runInNewContext(code + ";standaloneRun", {
    load, LoginomHost, standaloneRunControl: () => control, standaloneCancellation: () => controller.signal,
    standaloneBundle: async () => ({ node: "/fixture/node", resources: "/fixture/resources" }),
    launchNodeHost: async (input: { root: string; headless: boolean; packagePath?: string }, original: object) => {
      expect(original).toBe(control)
      expect(input.root).toBe("/fixture/profile")
      expect(input.headless).toBe(true)
      expect(input.packagePath).toBeUndefined()
      events.push("ordinary-launch")
      return host
    },
    launchSortingDiagnostic: async () => { throw Error("ordinary CLI must not launch diagnostic") },
    Product: { cliExecutable: "fixture" }, Schema: { decodeUnknownOption: () => (value: unknown) => ({ value }) },
    Option: { isNone: () => false }, Loginom: { View: {} },
    process: { env: {}, stdin: {}, stderr: { write() {} }, stdout: { write() {} } },
    Error, Set, Promise, Object,
  })
  try {
    // No compile-time acceptance symbol, as in the standard product build.
    await runtime(["run", "--headless"], { loginom: "/fixture/profile" })
    expect(events).toEqual(["ordinary-launch", "parse", "acquire", "parsed", "host-close", "release", "dispose"])
  } finally {
    LoginomHost.disconnect()
  }
})
