import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { cliCredentials } from "../src/connection/cli-credentials"
import { credentials, type CredentialCodec, type Secrets } from "../src/connection/credentials"
import { connectionStore } from "../src/connection/connection-store"

test("async CLI codec persists a private versioned format separate from Desktop", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-cli-codec-"))
  try {
    const codec = cliCredentials("linux")
    const store = connectionStore(root, codec)
    await store.stage({
      generation: 1,
      revision: 1,
      url: "http://example.test",
      username: "user",
      apiKey: "test-key",
      password: "",
    })
    await store.activate(1)
    expect(await store.read()).toMatchObject({ apiKey: "test-key", password: "" })
    const file = join(root, "connection.json")
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(file, "utf8")).secrets).toMatchObject({
      format: "loginom-cli-secrets-v1",
      protection: "plaintext",
    })
    await expect(codec.decode(credentials("linux").encode({ apiKey: "test", password: "" }))).rejects.toThrow(
      "LOGINOM_CREDENTIAL_FORMAT_INVALID",
    )
    await expect(
      codec.decode({ format: "loginom-cli-secrets-v1", protection: "plaintext", payload: "private-invalid-json" }),
    ).rejects.toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.each((["win32", "darwin"] as const).filter((platform) => platform !== "win32" || process.platform !== "win32"))(
  "%s does not silently fall back to plaintext when native protection is unavailable",
  async (platform) => {
    await expect(cliCredentials(platform).encode({ apiKey: "test", password: "" })).rejects.toThrow(
      "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE",
    )
  },
)

test.skipIf(process.platform !== "linux")("Desktop does not stage credentials without Secret Service", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-desktop-codec-"))
  try {
    const child = Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        `import { cliCredentials } from ${JSON.stringify(new URL("../src/connection/cli-credentials.ts", import.meta.url).href)};
         import { connectionStore } from ${JSON.stringify(new URL("../src/connection/connection-store.ts", import.meta.url).href)};
         const root = process.argv[1];
         const store = connectionStore(root, cliCredentials("linux", { root, resources: root, desktop: true }));
         try {
           await store.stage({ generation: 1, revision: 1, url: "https://app.loginom.ai/", username: "test", apiKey: "fixture", password: "fixture" });
           process.exitCode = 1;
         } catch (error) {
           if (error.message !== "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE") throw error;
         }`,
        root,
      ],
      env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: `unix:path=${root}/no-session-bus` },
      stdout: "ignore",
      stderr: "pipe",
    })
    expect(await child.exited).toBe(0)
    expect(await connectionStore(root).latestGeneration()).toBe(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upgrading Desktop protects active and pending records and erases secret fields in retired generations", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-desktop-upgrade-"))
  const legacy = cliCredentials("linux")
  const vault = new Map<string, Secrets>()
  const codec: CredentialCodec = {
    retireDesktopSecrets: true,
    encode({ apiKey, password }) {
      const reference = String(vault.size + 1)
      vault.set(reference, { apiKey, password })
      return { format: "loginom-cli-secrets-v1", protection: "secret-service", payload: reference }
    },
    async decode(value) {
      if ("format" in value && value.protection === "secret-service") {
        const found = vault.get(value.payload)
        if (!found) throw Error("vault record missing")
        return found
      }
      return legacy.decode(value)
    },
  }
  const value = (generation: number) => ({
    generation,
    revision: generation,
    url: "https://loginom.example.test/",
    username: "fixture-user",
    apiKey: `fixture-key-${generation}`,
    password: `fixture-password-${generation}`,
  })
  try {
    const previous = connectionStore(root, legacy)
    await previous.stage(value(1))
    await previous.stage(value(2))
    await previous.activate(2)
    await previous.savePending(value(3))
    const abandoned = join(root, "pending.json.01234567-89ab-4cde-8abc-0123456789ab.tmp")
    await writeFile(abandoned, "fixture-password-4", { mode: 0o600 })

    const rejected = connectionStore(root, {
      ...codec,
      encode() {
        throw Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
      },
    })
    await expect(rejected.protectDesktopCredentials()).rejects.toThrow("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
    expect(await previous.read()).toEqual(value(2))
    expect(await previous.pending()).toEqual(value(3))

    const desktop = connectionStore(root, codec)
    await desktop.protectDesktopCredentials()
    expect(await desktop.read()).toEqual(value(2))
    expect(await desktop.pending()).toEqual(value(3))
    expect(await desktop.staged(2)).toEqual(value(2))
    expect(await desktop.staged(1)).toBeUndefined()
    await expect(stat(abandoned)).rejects.toThrow("ENOENT")
    for (const file of ["connection.json", "pending.json", "generations/1.json", "generations/2.json"]) {
      expect(await readFile(join(root, file), "utf8")).not.toMatch(/fixture-(password|key)-/)
      if (process.platform !== "win32") expect((await stat(join(root, file))).mode & 0o777).toBe(0o600)
    }

    await desktop.stage(value(3))
    await desktop.activate(3)
    const reopened = connectionStore(root, codec)
    await reopened.protectDesktopCredentials()
    expect(await reopened.read()).toEqual(value(3))
    expect(await reopened.staged(2)).toBeUndefined()
    expect(await reopened.pending()).toBeUndefined()
    expect(await reopened.latestGeneration()).toBe(3)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("Windows codec rejects plaintext and malformed ciphertext without a native call", async () => {
  for (const value of [
    { format: "loginom-cli-secrets-v1" as const, protection: "plaintext" as const, payload: "{}" },
    { format: "loginom-cli-secrets-v1" as const, protection: "dpapi" as const, payload: "not base64!" },
  ])
    await expect(cliCredentials("win32").decode(value)).rejects.toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
})

test.skipIf(process.platform !== "win32")(
  "native DPAPI roundtrip, fresh ciphertext and tamper rejection",
  async () => {
    const codec = cliCredentials("win32")
    const secrets = { apiKey: "native-test-key-ключ", password: "пароль\nwith spaces" }
    const first = await codec.encode(secrets)
    const second = await codec.encode(secrets)
    expect(first).toMatchObject({ format: "loginom-cli-secrets-v1", protection: "dpapi" })
    expect(first).not.toEqual(second)
    expect(JSON.stringify(first)).not.toContain(secrets.apiKey)
    expect(await codec.decode(first)).toEqual(secrets)
    if (!("payload" in first)) throw Error("Expected CLI envelope")
    const damaged = Buffer.from(first.payload, "base64")
    damaged[damaged.length - 1] ^= 1
    await expect(codec.decode({ ...first, payload: damaged.toString("base64") })).rejects.toThrow(
      "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE",
    )
  },
  120_000,
)

test("native codecs reject oversized envelopes before requesting OS protection", async () => {
  const payload = "A".repeat(2 * 1024 * 1024 + 4)
  await expect(
    cliCredentials("win32").decode({ format: "loginom-cli-secrets-v1", protection: "dpapi", payload }),
  ).rejects.toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  await expect(
    cliCredentials("darwin", { root: "/private/profile", resources: "/private/resources" }).decode({
      format: "loginom-cli-secrets-v1",
      protection: "keychain",
      payload,
    }),
  ).rejects.toThrow("LOGINOM_CREDENTIAL_FORMAT_INVALID")
})

test.skipIf(process.platform !== "win32")(
  "native DPAPI roundtrips the maximum accepted plaintext",
  async () => {
    const codec = cliCredentials("win32")
    const value = {
      apiKey: "x".repeat(1024 * 1024 - Buffer.byteLength(JSON.stringify({ apiKey: "", password: "" }))),
      password: "",
    }
    const protectedValue = await codec.encode(value)
    expect(await codec.decode(protectedValue)).toEqual(value)
  },
  60_000,
)
