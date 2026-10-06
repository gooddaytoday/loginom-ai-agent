import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { credentials } from "../src/connection/credentials"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"

test("an unconfigured local run exposes diagnostics and defers connection errors until an external operation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-local-run-"))
  const root = join(directory, "profile")
  const host = await createLoginomHost({
    root,
    resources: join(directory, "absent-resources"),
    codec: credentials("linux"),
    environment: {},
    strictRecovery: true,
  })
  const requests = new EventEmitter()
  const replies = new EventEmitter()
  const port = loginomHostPort(
    { postMessage: (value) => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} },
    host,
  )
  const client = transport({
    postMessage: (value) => requests.emit("message", { data: value }),
    on: replies.on.bind(replies),
    start() {},
  })
  try {
    await host.settled()
    expect(await client.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 0 })
    expect(await client.request("tools", { run: "one" })).toMatchObject({
      tools: [expect.objectContaining({ name: "dock_prepare" }), expect.objectContaining({ name: "dock_diagnostics" })],
    })
    expect(
      await client.request("call", { run: "one", name: "dock_diagnostics", args: {}, userMessage: "original" }),
    ).toMatchObject({ structuredContent: { state: "unconfigured", generation: 0, hasApiKey: false } })
    await expect(client.request("acquire", { run: "duplicate", session: "chat" })).rejects.toThrow("LOGINOM_CALL_BUSY")
    await expect(
      client.request("call", { run: "one", name: "read", args: { uri: "Help/node.md" }, userMessage: "original" }),
    ).rejects.toThrow("LOGINOM_CONFIG_REQUIRED")
    expect(await client.request("interrupt", { run: "one" })).toBe(true)
    expect(host.journal.pending()).toEqual([])
    expect(await readdir(join(root, "recovery"))).toEqual([])
    expect(await readdir(root)).not.toContain("runtime")
    expect(await readdir(root)).not.toContain("knowledge")
    expect(await client.request("release", { run: "one" })).toBe(true)
    expect(await client.request("acquire", { run: "next", session: "chat" })).toEqual({ generation: 0 })
    await client.request("release", { run: "next" })
    const attempts = await Promise.allSettled(
      ["A", "B"].map((run) => client.request("acquire", { run, session: "same-new-chat" })),
    )
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toMatchObject([
      { reason: expect.objectContaining({ message: "LOGINOM_CALL_BUSY" }) },
    ])
    for (const [index, attempt] of attempts.entries())
      if (attempt.status === "fulfilled") await client.request("release", { run: ["A", "B"][index] })
  } finally {
    client.close()
    await port.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
})
