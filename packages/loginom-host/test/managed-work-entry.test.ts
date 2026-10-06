import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { supervise } from "../src/supervisor"

test("actual managed entry reads live bridge work and dispatching over private IPC", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "managed-work-entry-"))
  const work = join(directory, "work.json")
  const src = join(directory, "runtime/src")
  const files = {
    "runtime/src/managed-entry.mjs": await readFile(
      new URL("../../loginom-runtime/src/managed-entry.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/src/start-input.mjs": await readFile(
      new URL("../../loginom-runtime/src/start-input.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/src/resources.mjs": "export async function verifyResources() { return {} }",
    "runtime/src/connection-check.mjs": `
      export const loginomAddress = value => value;
      export const loginBrowser = async () => ({ context: { close: async () => {} } });`,
    "runtime/client/package.json": JSON.stringify({ type: "module" }),
    "runtime/client/lib/session.mjs": `
      export async function createSession() {
        return { browserConfig: ${JSON.stringify(work)}, metadata: { clientRevision: 'fixture' } };
      }`,
    "runtime/client/lib/artifacts.mjs":
      'export async function admitStartupArtifacts() { throw Error("unexpected admission") }',
    "runtime/client/lib/bridge.mjs": `
      import { readFileSync } from 'node:fs';
      const work = () => JSON.parse(readFileSync(${JSON.stringify(work)}, 'utf8'));
      export async function createBridge() { return {
        server: { connect: async () => {} }, close: async () => {},
        hasActiveWork: () => work().activeWork, hasUnsettledWork: () => work().unsettledWork,
      } }`,
    "runtime/client/node_modules/@modelcontextprotocol/sdk/package.json": JSON.stringify({ type: "commonjs" }),
    "runtime/client/node_modules/@modelcontextprotocol/sdk/client/index.js": `
      exports.Client = class {
        async connect() {} async close() {}
        async callTool(input, _unused, { signal }) {
          if (!input.arguments.hold) return { content: [] };
          await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
        }
      }`,
    "runtime/client/node_modules/@modelcontextprotocol/sdk/inMemory.js":
      "exports.InMemoryTransport = { createLinkedPair: () => [{}, {}] }",
    "runtime/client/node_modules/@playwright/mcp/package.json": JSON.stringify({ type: "commonjs", main: "index.js" }),
    "runtime/client/node_modules/@playwright/mcp/index.js":
      "exports.createConnection = async () => ({ connect: async () => {}, close: async () => {} })",
  }
  // The entry and start validator are byte-identical copies. Only external browser/MCP/bridge boundaries are controlled.
  for (const [name, contents] of Object.entries(files)) {
    const target = join(directory, name)
    await mkdir(dirname(target), { recursive: true })
    await Bun.write(target, contents)
  }
  await Bun.write(work, JSON.stringify({ activeWork: false, unsettledWork: false }))
  const runtime = await supervise({
    node,
    entry: join(src, "managed-entry.mjs"),
    resources: directory,
    stateDir: join(directory, "state"),
    generation: 1,
    chat: "chat",
    endpoint: "http://example.test",
    connection: { url: "http://example.test", username: "user", apiKey: "fixture", password: "" },
    environment: {},
  })
  try {
    expect(await readFile(join(src, "managed-entry.mjs"), "utf8")).toBe(
      await readFile(new URL("../../loginom-runtime/src/managed-entry.mjs", import.meta.url), "utf8"),
    )
    for (const state of [
      { activeWork: true, unsettledWork: true },
      { activeWork: false, unsettledWork: true },
      { activeWork: false, unsettledWork: false },
    ]) {
      await Bun.write(work, JSON.stringify(state))
      expect(await runtime.request("work")).toEqual({ ...state, dispatching: false })
    }
    const call = runtime
      .request("call", { name: "fixture", arguments: { hold: true } })
      .catch((error: unknown) => error)
    expect(await runtime.request("work")).toEqual({ activeWork: false, unsettledWork: false, dispatching: true })
    expect(await runtime.request("interrupt")).toEqual({ interrupted: true })
    expect(await call).toMatchObject({ message: "LOGINOM_RUNTIME_FAILED" })
    expect(await runtime.request("work")).toEqual({ activeWork: false, unsettledWork: false, dispatching: false })
  } finally {
    await runtime.close()
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    await rm(directory, { recursive: true, force: true })
  }
})
