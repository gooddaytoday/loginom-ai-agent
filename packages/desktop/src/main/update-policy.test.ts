import { expect, test } from "bun:test"
import { validateUpdate } from "./update-policy"

const file = { url: "loginom-ai-agent-linux-x86_64.AppImage", sha512: Buffer.alloc(64).toString("base64") }
const feed = "https://updates.example.test/agent/"

test("accepts a hashed asset within the own product feed", () => {
  expect(() => validateUpdate({ version: "0.1.1", files: [file] }, feed, "prod")).not.toThrow()
})

test("rejects upstream, escaped paths, missing hashes and foreign channels before download", () => {
  for (const url of ["https://opencode.ai/agent/" + file.url, "../" + file.url, "opencode.AppImage"]) {
    expect(() => validateUpdate({ version: "0.1.1", files: [{ ...file, url }] }, feed, "prod")).toThrow()
  }
  expect(() => validateUpdate({ version: "0.1.1", files: [{ ...file, sha512: "" }] }, feed, "prod")).toThrow()
  expect(() => validateUpdate({ version: "0.1.1-beta.1", files: [file] }, feed, "prod")).toThrow()
  expect(() => validateUpdate({ version: "0.1.1", files: [file] }, feed, "beta")).toThrow()
})
