import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { DashboardResources } from "./resources.ts"

export async function selfCheck(input: { resources: DashboardResources; url: string; signal?: AbortSignal }): Promise<{ ok: boolean; state: string; errors: string[] }> {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-check-"))
  try {
    return await new Promise<{ ok: boolean; state: string; errors: string[] }>(resolve => {
      const env = { PATH: dirname(input.resources.node), LANG: "C.UTF-8", HOME: directory, TMPDIR: directory, TEMP: directory, TMP: directory, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) }
      const child = execFile(input.resources.node, [input.resources.selfcheck, input.resources.playwright, input.resources.chromium, input.url], { cwd: directory, env, timeout: 30_000, signal: input.signal }, (error, stdout, stderr) => {
        if (error) return void closed.then(() => resolve({ ok: false, state: "failed", errors: [Buffer.from(stderr || error.message).subarray(0, 2_048).toString()] }))
        const result = Promise.resolve().then(() => JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as unknown)
          .then(value => {
            if (!value || typeof value !== "object" || !("ok" in value) || typeof value.ok !== "boolean" || !("state" in value) || typeof value.state !== "string" || !("errors" in value) || !Array.isArray(value.errors) || !value.errors.every(item => typeof item === "string")) throw Error("Invalid self-check result")
            return { ok: value.ok, state: value.state, errors: value.errors.slice(0, 20) as string[] }
          }).catch(() => ({ ok: false, state: "failed", errors: [Buffer.from(stderr).subarray(0, 2_048).toString()] }))
        void closed.then(() => resolve(result))
      })
      // Abort callbacks run before Playwright has closed its browser and temporary profile.
      const closed = new Promise<void>(done => child.once("close", () => done()))
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
