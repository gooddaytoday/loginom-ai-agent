const { app, safeStorage } = require("electron")
const assert = require("node:assert/strict")
const { readFile, writeFile } = require("node:fs/promises")
const { isAbsolute } = require("node:path")

const secret = { apiKey: "loginom-safe-storage-smoke-key", password: "loginom-safe-storage-smoke-password" }
const mode = process.env.LOGINOM_SAFE_STORAGE_MODE
const data = process.env.LOGINOM_SAFE_STORAGE_DATA
const evidence = process.env.LOGINOM_SAFE_STORAGE_EVIDENCE
const codecPath = process.env.LOGINOM_SAFE_STORAGE_CODEC
const profile = process.env.LOGINOM_SAFE_STORAGE_PROFILE

for (const path of [data, evidence, codecPath, profile]) {
  if (!path || !isAbsolute(path)) throw new Error("LOGINOM_SMOKE_PATH_INVALID")
}
if (!["write", "read", "unavailable"].includes(mode)) throw new Error("LOGINOM_SMOKE_MODE_INVALID")
app.setPath("userData", profile)

app.whenReady().then(async () => {
  try {
    // Bundle the production Desktop re-export with Bun before launching Electron.
    const { credentials } = require(codecPath)
    if (mode === "unavailable") {
      const codec = credentials(process.platform, {
        isEncryptionAvailable: () => false,
        encryptString() { throw new Error("UNEXPECTED_ENCRYPT") },
        decryptString() { throw new Error("UNEXPECTED_DECRYPT") },
      })
      assert.throws(() => codec.encode(secret), { message: "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE" })
      assert.throws(() => codec.decode({ encrypted: "protected" }), { message: "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE" })
      assert.throws(() => codec.decode(secret), { message: "LOGINOM_CREDENTIAL_FORMAT_INVALID" })
      await assert.rejects(readFile(data), { code: "ENOENT" })
      await writeFile(evidence, JSON.stringify({ mode, plaintextFallback: false, encodeRejected: true, decodeRejected: true }) + "\n", { flag: "wx" })
      app.exit(0)
      return
    }
    if (!safeStorage.isEncryptionAvailable()) throw new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
    const codec = credentials(process.platform, safeStorage)
    if (mode === "write") {
      await writeFile(data, JSON.stringify(codec.encode(secret)), { flag: "wx" })
    }
    // In read mode these bytes were written by an earlier, exited Electron process.
    const stored = await readFile(data, "utf8")
    const envelope = JSON.parse(stored)
    assert.deepEqual(Object.keys(envelope), ["encrypted"])
    const encrypted = Buffer.from(envelope.encrypted, "base64")
    for (const value of Object.values(secret)) {
      if (stored.includes(value) || encrypted.includes(Buffer.from(value))) throw new Error("LOGINOM_CREDENTIAL_PLAINTEXT")
    }
    assert.deepEqual(codec.decode(envelope), secret)

    const damaged = Buffer.from(encrypted)
    damaged[damaged.length - 1] ^= 0xff
    assert.throws(() => codec.decode({ encrypted: damaged.toString("base64") }))
    const result = JSON.stringify({ mode, pid: process.pid, available: true, roundtrip: true, tamperRejected: true }) + "\n"
    await writeFile(evidence, result, { flag: "wx" })
    app.exit(0)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "LOGINOM_SAFE_STORAGE_SMOKE_FAILED"}\n`)
    app.exit(1)
  }
})
