import { expect, mock } from "bun:test"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyResources } from "../../../loginom-runtime/src/resources.mjs"
import { credentials } from "../../src/connection/credentials"

const verified = Promise.withResolvers<void>()
const release = Promise.withResolvers<void>()
const verify = verifyResources
const [root, resources, mode] = process.argv.slice(2)
// Verify the real files, then hold delivery of the proof until cancellation.
// File size and child startup speed cannot establish that ordering reliably.
mock.module(fileURLToPath(new URL("../../../loginom-runtime/src/resources.mjs", import.meta.url)), () => ({
  verifyResources: async (...args: Parameters<typeof verifyResources>) => {
    if (mode === "installation") {
      if (args[1]?.forceHash) {
        const signal = args[1].signal!
        verified.resolve()
        await new Promise<void>((resolve, reject) => {
          const abort = () => reject(signal.reason)
          if (signal.aborted) return abort()
          signal.addEventListener("abort", abort, { once: true })
          void release.promise.then(() => {
            signal.removeEventListener("abort", abort)
            resolve()
          })
        })
      }
      return verify(...args)
    }
    const result = await verify(...args)
    verified.resolve()
    await release.promise
    return result
  },
}))

const { createLoginomHost } = await import("../../src/host")
const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
if (mode === "installation") {
  const saving = host.verifyInstallationResources().catch((error) => error)
  await verified.promise
  const deadline = Promise.withResolvers<Error>()
  const timer = setTimeout(() => deadline.resolve(Error("INSTALLATION_VERIFY_NOT_CANCELLED")), 2000)
  try {
    host.beginClose()
    // Node entry drains this operation before host.close(); cancellation must
    // settle it without needing host.close() or forced process termination.
    expect((await Promise.race([saving, deadline.promise])).name).toBe("AbortError")
    expect(await readdir(root)).not.toContain("validation")
    expect(await readdir(root)).not.toContain("knowledge")
  } finally {
    clearTimeout(timer)
    release.resolve()
    await saving
    await host.close()
  }
  process.exit(0)
}
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
