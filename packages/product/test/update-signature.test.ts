import { expect, test } from "bun:test"
import { generateKeyPairSync, sign } from "node:crypto"
import {
  UPDATE_PUBLIC_KEYS,
  verifyUpdateSignature,
  presignUpdateGet,
  parseUpdateS3Config,
  redactUpdateMessage,
} from "../src/update-signature"

const primary = generateKeyPairSync("ed25519")
const backup = generateKeyPairSync("ed25519")
const foreign = generateKeyPairSync("ed25519")
const keys = [primary, backup].map((pair) => pair.publicKey.export({ type: "spki", format: "pem" }).toString())
const bytes = Buffer.from("version: 0.4.0\n")

test("SigV4 GET matches the AWS published query-authentication vector", () => {
  // AWS S3 sigv4-query-string-auth example; these are public example credentials.
  const url = new URL(
    presignUpdateGet(
      {
        endpoint: "https://s3.amazonaws.com",
        bucket: "examplebucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
      "test.txt",
      { now: new Date("2013-05-24T00:00:00Z"), expires: 86400 },
    ),
  )
  expect(url.host).toBe("examplebucket.s3.amazonaws.com")
  expect(url.searchParams.get("X-Amz-Signature")).toBe(
    "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  )
  expect(url.pathname).toBe("/test.txt")
})

test("S3 config rejects unsafe endpoints and signs only GET keys on the virtual host", () => {
  const config = {
    endpoint: "https://s3.example.test",
    region: "ru-central-1",
    bucket: "updates-test",
    accessKeyId: "tenant:key",
    secretAccessKey: "test-only-secret",
  }
  expect(parseUpdateS3Config(config).endpoint).toBe(config.endpoint + "/")
  for (const change of [
    { endpoint: "http://s3.test/" },
    { endpoint: "https://s3.test/bucket" },
    { bucket: "../other" },
    { accessKeyId: "key" },
    { secretAccessKey: "" },
  ])
    expect(() => parseUpdateS3Config({ ...config, ...change })).toThrow("S3_CONFIG_INVALID")
  const url = presignUpdateGet(config, "releases/0.4.0/loginom-ai-agent.exe")
  expect(new URL(url).hostname).toBe("updates-test.s3.example.test")
  expect(url).not.toContain(config.secretAccessKey)
  expect(redactUpdateMessage('Cannot download "' + url + '", status 403')).not.toContain("tenant")
  expect(redactUpdateMessage(url)).not.toContain("X-Amz-Signature")
  for (const path of ["../escape", "/escape", "releases/a%2fb", "releases/./file"])
    expect(() => presignUpdateGet(config, path)).toThrow("S3_TARGET_INVALID")
})

test("accepts exact bytes signed by either trusted Ed25519 key", () => {
  for (const pair of [primary, backup])
    expect(verifyUpdateSignature(bytes, sign(null, bytes, pair.privateKey).toString("base64"), keys)).toBe(true)
})

test("rejects foreign key, modified bytes, malformed base64 and missing signature", () => {
  const signature = sign(null, bytes, primary.privateKey).toString("base64")
  expect(verifyUpdateSignature(bytes, sign(null, bytes, foreign.privateKey).toString("base64"), keys)).toBe(false)
  expect(verifyUpdateSignature(Buffer.from("version: 0.4.1\n"), signature, keys)).toBe(false)
  for (const invalid of ["", "garbage", signature + "!", signature.slice(4)])
    expect(verifyUpdateSignature(bytes, invalid, keys)).toBe(false)
  expect(verifyUpdateSignature(bytes, signature)).toBe(false)
  expect(UPDATE_PUBLIC_KEYS).toHaveLength(2)
})
