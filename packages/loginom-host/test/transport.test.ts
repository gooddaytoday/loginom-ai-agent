import { expect, test } from "bun:test"
import { supervise } from "../src/supervisor"

test("private disconnect rejects pending and future requests without waiting for timeout", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  // Bun 1.3.11 does not emit worker_threads MessagePort close; exercise Node's
  // real event delivery, which is the runtime used by the private host/sidecar.
  const built = await Bun.build({
    entrypoints: [new URL("../src/transport.ts", import.meta.url).pathname],
    target: "node",
  })
  if (!built.success) throw new Error("Transport test bundle failed")
  const module = "data:text/javascript;base64," + Buffer.from(await built.outputs[0].text()).toString("base64")
  const script = `
    import { MessageChannel } from "node:worker_threads";
    import assert from "node:assert/strict";
    import { transport } from ${JSON.stringify(module)};
    const channel = new MessageChannel();
    const received = Promise.withResolvers();
    channel.port1.once("message", () => received.resolve());
    const client = transport({
      postMessage: value => channel.port2.postMessage(value),
      on: (_event, listener) => channel.port2.on("message", data => listener({ data })),
      onClose: listener => channel.port2.on("close", listener),
      start: () => channel.port2.start(),
    });
    try {
      const pending = client.request("tools", { run: "run" }).catch(error => error.message);
      await received.promise;
      channel.port1.close();
      assert.equal(await pending, "LOGINOM_HOST_CLOSED");
      await assert.rejects(client.request("acquire", {}), /LOGINOM_HOST_CLOSED/);
    } finally {
      client.close(); channel.port1.close(); channel.port2.close();
    }
  `
  const child = Bun.spawn([node, "--input-type=module", "--eval", script], { stdout: "pipe", stderr: "pipe" })
  const timeout = setTimeout(() => child.kill("SIGKILL"), 3000)
  try {
    expect(await child.exited).toBe(0)
    expect(await new Response(child.stderr).text()).toBe("")
  } finally {
    clearTimeout(timeout)
    child.kill()
  }
})

test("managed launch rejects relative executable paths before starting any process", async () => {
  await expect(
    supervise({
      node: "node",
      entry: "/runtime/entry.mjs",
      resources: "/runtime",
      stateDir: "/data",
      chat: "chat",
      generation: 1,
      endpoint: "https://example.test/mcp",
      connection: { apiKey: "key", password: "", url: "http://example.test", username: "user" },
    }),
  ).rejects.toThrow("LOGINOM_ABSOLUTE_PATH_REQUIRED")
})
