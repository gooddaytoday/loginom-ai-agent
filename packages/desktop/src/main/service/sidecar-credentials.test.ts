import { afterEach, describe, expect, test } from "bun:test"
import { authorization, ready, remote } from "./sidecar-credentials"

const sidecar = { url: "http://127.0.0.1:4096", password: "secret" }

const expected = `Basic ${Buffer.from("loginom-ai-agent:secret").toString("base64")}`

const username = process.env.LOGINOM_AI_AGENT_SERVER_USERNAME

afterEach(() => {
  if (username !== undefined) {
    process.env.LOGINOM_AI_AGENT_SERVER_USERNAME = username
    return
  }
  delete process.env.LOGINOM_AI_AGENT_SERVER_USERNAME
})

describe("sidecar authorization", () => {
  test("adds the Basic credential only for the sidecar origin", () => {
    expect(authorization(sidecar, "http://127.0.0.1:4096/api/session?limit=1")).toBe(expected)
    expect(authorization(sidecar, "http://127.0.0.1:4097/api/session")).toBeUndefined()
    expect(authorization(sidecar, "http://localhost:4096/api/session")).toBeUndefined()
    expect(authorization(sidecar, "https://127.0.0.1:4096/api/session")).toBeUndefined()
    expect(authorization(sidecar, "not a url")).toBeUndefined()
    expect(authorization(undefined, "http://127.0.0.1:4096/api/session")).toBeUndefined()
    expect(authorization({ url: sidecar.url, password: null }, "http://127.0.0.1:4096/api/session")).toBeUndefined()
  })

  // Loginom AI Agent (B2.7a11): the own service inherits Desktop's environment and its user; a server in WSL, over SSH
  // or added by the user does not, and keeps the default one.
  test("signs the own service in with Desktop's user and any other server with the default", () => {
    process.env.LOGINOM_AI_AGENT_SERVER_USERNAME = "alice"
    expect(authorization(sidecar, "http://127.0.0.1:4096/api/session")).toBe(
      `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    )
    expect(remote("secret")).toBe(expected)
  })

  test("hands the renderer the origin only", () => {
    expect(ready(sidecar)).toEqual({ url: sidecar.url })
  })
})
