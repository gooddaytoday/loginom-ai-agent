import { expect, mock } from "bun:test"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyResources } from "../../../loginom-runtime/src/resources.mjs"
import { credentials } from "../../src/connection/credentials"

const verified = Promise.withResolvers<void>()
const release = Promise.withResolvers<void>()
const verify = verifyResources
// Verify the real files, then hold delivery of the proof until cancellation.
// File size and child startup speed cannot establish that ordering reliably.
mock.module(fileURLToPath(new URL("../../../loginom-runtime/src/resources.mjs", import.meta.url)), () => ({
  verifyResources: async (...args: Parameters<typeof verifyResources>) => {
    const result = await verify(...args)
    verified.resolve()
    await release.promise
    return result
  },
}))

const { createLoginomHost } = await import("../../src/host")
const [root, resources] = process.argv.slice(2)
const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
try {
  await verified.promise
  const checking = host.api
    .check({ revision: 0, url: "https://example.test", username: "fixture", password: { operation: "empty" } })
    .catch((error) => error)
  for (let i = 0; i < 1000; i++) {
    if (
      (
        await Bun.file(join(root, "startup-phases.jsonl"))
          .text()
          .catch(() => "")
      ).includes('"phase":"resources.wait"')
    )
      break
    if (i === 999) throw Error("PREWARM_WAIT_NOT_OBSERVED")
    await Bun.sleep(5)
  }
  host.beginClose()
  expect((await checking).message).toBe("LOGINOM_HOST_CLOSED")
  const evidence = await Bun.file(join(root, "validation/startup-failures.jsonl")).text()
  expect(evidence).toContain('"phase":"resources.wait"')
  expect(evidence).toContain("LOGINOM_HOST_CLOSED")
  expect(await readdir(join(root, "validation"))).toEqual(["startup-failures.jsonl"])
  const phases = (await Bun.file(join(root, "startup-phases.jsonl")).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  expect(phases.filter((event) => event.phase === "resources.wait").map((event) => event.status)).toEqual(["starting"])
} finally {
  release.resolve()
  await host.close()
}
