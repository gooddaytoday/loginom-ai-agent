import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { tmpdir } from "node:os"
import { cliCredentials } from "../src/connection/cli-credentials"

// Synthetic secrets only. Run reject-other-user explicitly from another account.
// This script never changes accounts, permissions or the user's real profile.
if (process.platform !== "win32" || process.arch !== "x64") throw Error("WINDOWS_X64_REQUIRED")
const action = process.argv[2]
if (!["create", "reopen", "reject-other-user"].includes(action)) throw Error("DPAPI_ACCEPTANCE_ACTION_INVALID")
const directory = action === "create" ? await mkdtemp(join(tmpdir(), "loginom-dpapi-acceptance-")) : process.argv[3]
if (!directory || !isAbsolute(directory)) throw Error("DPAPI_ACCEPTANCE_DIRECTORY_REQUIRED")
const systemRoot = process.env.SystemRoot
if (!systemRoot || !isAbsolute(systemRoot)) throw Error("DPAPI_ACCEPTANCE_SYSTEM_ROOT_REQUIRED")
const identity = Bun.spawn([join(systemRoot, "System32/whoami.exe"), "/user", "/fo", "csv", "/nh"], {
  env: { SystemRoot: systemRoot },
  stdout: "pipe",
  stderr: "ignore",
})
const sid = (await new Response(identity.stdout).text()).match(/S-1-\d+(?:-\d+)+/)?.[0]
if ((await identity.exited) !== 0 || !sid) throw Error("DPAPI_ACCEPTANCE_IDENTITY_FAILED")
const codec = cliCredentials("win32")
const value = { apiKey: "dpapi-acceptance-ключ", password: "test-password\nwith spaces" }
if (action === "create") {
  const first = await codec.encode(value)
  const second = await codec.encode(value)
  if (!("format" in first) || first.protection !== "dpapi") throw Error("DPAPI_ACCEPTANCE_ENVELOPE_INVALID")
  if (JSON.stringify(first) === JSON.stringify(second) || JSON.stringify(first).includes(value.apiKey))
    throw Error("DPAPI_ACCEPTANCE_CIPHERTEXT_INVALID")
  if (JSON.stringify(await codec.decode(first)) !== JSON.stringify(value))
    throw Error("DPAPI_ACCEPTANCE_ROUNDTRIP_FAILED")
  const damaged = Buffer.from(first.payload, "base64")
  damaged[damaged.length - 1] ^= 1
  await rejects(() => codec.decode({ ...first, payload: damaged.toString("base64") }))
  await writeFile(join(directory, "test-envelope.json"), JSON.stringify({ sid, envelope: first }), { flag: "wx" })
  const child = Bun.spawn([process.execPath, import.meta.path, "reopen", directory], {
    stdout: "ignore",
    stderr: "ignore",
  })
  if ((await child.exited) !== 0) throw Error("DPAPI_ACCEPTANCE_NEW_PROCESS_FAILED")
}
if (action !== "create") {
  const saved = JSON.parse(await readFile(join(directory, "test-envelope.json"), "utf8"))
  if (typeof saved.sid !== "string" || !/^S-1-\d+(?:-\d+)+$/.test(saved.sid))
    throw Error("DPAPI_ACCEPTANCE_SAVED_IDENTITY_INVALID")
  if (action === "reopen") {
    if (saved.sid !== sid) throw Error("DPAPI_ACCEPTANCE_SAME_USER_REQUIRED")
    if (JSON.stringify(await codec.decode(saved.envelope)) !== JSON.stringify(value))
      throw Error("DPAPI_ACCEPTANCE_REOPEN_FAILED")
  }
  if (action === "reject-other-user") {
    if (saved.sid === sid) throw Error("DPAPI_ACCEPTANCE_DIFFERENT_USER_REQUIRED")
    // A malformed envelope must not count as an OS-level isolation result.
    if (
      saved.envelope?.format !== "loginom-cli-secrets-v1" ||
      saved.envelope?.protection !== "dpapi" ||
      typeof saved.envelope?.payload !== "string" ||
      !saved.envelope.payload ||
      Buffer.from(saved.envelope.payload, "base64").toString("base64") !== saved.envelope.payload
    )
      throw Error("DPAPI_ACCEPTANCE_ENVELOPE_INVALID")
    // Prove DPAPI works for the receiving account before counting its rejection.
    if (JSON.stringify(await codec.decode(await codec.encode(value))) !== JSON.stringify(value))
      throw Error("DPAPI_ACCEPTANCE_RECEIVING_ACCOUNT_UNAVAILABLE")
    await rejects(() => codec.decode(saved.envelope))
  }
}
await writeFile(join(directory, `${action}-summary.json`), JSON.stringify({ status: "PASS", action, sid }), {
  flag: "wx",
})
console.log(JSON.stringify({ status: "PASS", action, evidence: directory }))

async function rejects(run: () => unknown) {
  const message = await Promise.resolve()
    .then(run)
    .then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : "unknown"),
    )
  if (message !== "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE") throw Error("DPAPI_ACCEPTANCE_REJECTION_MISSING")
}
