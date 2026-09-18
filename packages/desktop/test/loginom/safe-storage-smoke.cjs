const { app, safeStorage } = require("electron")
const { writeFile } = require("node:fs/promises")
const { isAbsolute } = require("node:path")

const secret = "loginom-safe-storage-smoke"

app.whenReady().then(async () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
    const encrypted = safeStorage.encryptString(secret)
    if (encrypted.includes(Buffer.from(secret))) throw new Error("LOGINOM_CREDENTIAL_PLAINTEXT")
    if (safeStorage.decryptString(encrypted) !== secret) throw new Error("LOGINOM_CREDENTIAL_ROUNDTRIP_FAILED")

    const damaged = Buffer.from(encrypted)
    damaged[damaged.length - 1] ^= 0xff
    let rejected = false
    try {
      safeStorage.decryptString(damaged)
    } catch {
      rejected = true
    }
    if (!rejected) throw new Error("LOGINOM_CREDENTIAL_TAMPER_ACCEPTED")
    const result = JSON.stringify({ available: true, roundtrip: true, tamperRejected: true }) + "\n"
    const evidence = process.env.LOGINOM_SAFE_STORAGE_EVIDENCE
    if (evidence) {
      if (!isAbsolute(evidence)) throw new Error("LOGINOM_EVIDENCE_PATH_INVALID")
      await writeFile(evidence, result, { flag: "wx" })
    } else {
      process.stdout.write(result)
    }
    app.exit(0)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "LOGINOM_SAFE_STORAGE_SMOKE_FAILED"}\n`)
    app.exit(1)
  }
})
