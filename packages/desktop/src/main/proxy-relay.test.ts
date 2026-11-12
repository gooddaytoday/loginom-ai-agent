import { test } from "bun:test"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { join } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

test("proxy relay socket contracts on Node (Electron main runtime)", async () => {
  // Bun's HTTP server does not expose a writable raw response socket. Exercise
  // the Node networking implementation used by Electron, including env proxies.
  const directory = await mkdtemp(join(tmpdir(), "proxy-relay-test-"))
  try {
    const cert = join(directory, "cert.pem")
    const key = join(directory, "key.pem")
    await promisify(execFile)("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ])
    const result = await promisify(execFile)(
      process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "node",
      ["--test", join(import.meta.dirname, "proxy-relay.node.ts")],
      {
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, NODE_EXTRA_CA_CERTS: cert, LOGINOM_PROXY_TEST_KEY: key },
      },
    ).catch((error) => {
      throw new Error(`${error.stdout}\n${error.stderr}`, { cause: error })
    })
    console.log(result.stdout)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 65_000)
