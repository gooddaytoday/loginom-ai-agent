import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildNodeHost } from "../script/build-node-host"
import { launchNodeHost } from "../src/node-client"

const fixture = { directory: "", entry: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-node-host-"))
  fixture.entry = await buildNodeHost(fixture.directory)
})
afterAll(async () => {
  if (fixture.directory) await rm(fixture.directory, { recursive: true, force: true })
})

test("bundled Node host handshakes without Electron, manages its profile and closes completely", async () => {
  const host = await launchNodeHost({
    node: fixture.node,
    entry: fixture.entry,
    root: join(fixture.directory, "profile"),
    resources: join(fixture.directory, "absent-runtime"),
    headless: true,
    environment: { ...process.env, OPENAI_API_KEY: "must-not-be-forwarded" },
  })
  try {
    expect(host.alive).toBe(true)
    expect(await host.request("connection.status", {})).toMatchObject({ state: "unconfigured", hasApiKey: false })
    const error = await host
      .request("connection.check", { apiKey: "private-sentinel" })
      .catch((error: Error) => error.message)
    expect(error).not.toContain("private-sentinel")
    expect(error).toBe("LOGINOM_CANDIDATE_INVALID")
    expect(await host.request("acquire", { run: "test", session: "chat" })).toBeNull()
  } finally {
    await host.close()
  }
  expect(host.alive).toBe(false)
  expect(await host.exited).toEqual({ code: 0, signal: null })
  await expect(host.request("connection.status", {})).rejects.toThrow("LOGINOM_HOST_CLOSED")
}, 15_000)

test.each(["ack-without-exit", "disconnect-without-exit", "bad-ack"])(
  "host shutdown is bounded and never accepts incomplete cleanup: %s",
  async (mode) => {
    const entry = join(fixture.directory, mode + ".mjs")
    await writeFile(
      entry,
      `
      setInterval(() => {}, 1000);
      process.on('message', m => {
        if (m.method === 'start') process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});
        if (m.method !== 'close') return;
        if (${JSON.stringify(mode)} === 'disconnect-without-exit') { process.disconnect(); return; }
        process.send({id:m.id,result:{closed:${mode !== "bad-ack"}}});
      });
    `,
    )
    const host = await launchNodeHost({
      node: fixture.node,
      entry,
      root: fixture.directory,
      resources: fixture.directory,
      headless: true,
    })
    await expect(host.close()).rejects.toThrow("LOGINOM_HOST_CLEANUP_FAILED")
    await expect(host.close()).rejects.toThrow("LOGINOM_HOST_CLEANUP_FAILED")
    expect(host.alive).toBe(false)
    const outcome = await host.exited
    expect(outcome.code !== 0 || outcome.signal !== null).toBe(true)
    await expect(host.request("connection.status", {})).rejects.toThrow("LOGINOM_HOST_CLOSED")
  },
  10000,
)
