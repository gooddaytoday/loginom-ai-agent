import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { RuntimeStartupError, supervise } from "../src/supervisor"

for (const scenario of [
  { failure: "LOGINOM_BROWSER_START_FAILED", validation: false, closed: false },
  { failure: "LOGINOM_HANDSHAKE_INVALID", validation: false, closed: false },
  { failure: "LOGINOM_HANDSHAKE_INVALID", validation: true, closed: true },
]) {
  test(`runtime startup preserves ${scenario.failure}, validation=${scenario.validation}, cleanup=${scenario.closed}`, async () => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-runtime-startup-"))
    const entry = join(directory, "runtime.mjs")
    try {
      await writeFile(
        entry,
        `process.on('message', message => {
          if (message.operation === 'start') process.send({id:message.id,${
            scenario.failure === "LOGINOM_BROWSER_START_FAILED"
              ? "error:'LOGINOM_BROWSER_START_FAILED'"
              : `result:{protocol:1,generation:message.input.generation${scenario.validation ? "" : "+1"},chat:message.input.chat,ready:true}`
          }});
          if (message.operation === 'close') process.send({id:message.id,result:{closed:${scenario.closed}}},()=>process.disconnect());
        });`,
      )
      const failure = await supervise({
        node,
        entry,
        resources: directory,
        stateDir: directory,
        generation: 1,
        chat: "startup",
        validation: scenario.validation,
        environment: {},
        endpoint: "https://example.test/mcp",
        connection: { apiKey: "fixture", password: "", url: "https://example.test/app/", username: "fixture" },
      }).then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(RuntimeStartupError)
      if (!(failure instanceof RuntimeStartupError)) throw new Error("Expected a runtime startup failure")
      expect(failure.message).toBe(scenario.failure)
      expect(failure.cause).toBeInstanceOf(Error)
      expect(failure.cause).toMatchObject({ message: scenario.failure })
      expect(failure.cleanupConfirmed).toBe(scenario.closed)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)
}
