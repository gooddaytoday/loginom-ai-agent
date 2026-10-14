import { expect, test } from "bun:test"
import { readlink, stat } from "node:fs/promises"
import { sampleProcessResources } from "../src/parallel-resources"

test("process resource sampling binds actual RSS and CPU ticks to its trusted birth identity", async () => {
  const identity = await selfIdentity()
  const owner = { kind: "command" as const, id: "resource-smoke" }
  const sample = await sampleProcessResources({ identity, owner })
  expect(sample.owner).toEqual(owner)
  expect(sample.identity).toEqual(identity)
  expect(sample.rss_bytes).toBeGreaterThan(0)
  expect(sample.cpu?.user_ticks).toBeGreaterThan(0)
  expect(sample.cpu?.system_ticks).toBeGreaterThanOrEqual(0)
  expect(sample.errors).toEqual([])
  expect(Number.isFinite(Date.parse(sample.observed_at))).toBe(true)
  expect(sample.verified).toBe(true)
  expect(sample.cgroup?.path).toBe((await Bun.file(`/proc/${process.pid}/cgroup`).text()).split("\n").find(line => line.startsWith("0::"))!.slice(3))
  expect(sample.cgroup?.cpu_usage?.usage_usec).toBeGreaterThan(0)
})

test("process resource sampling refuses changed birth, executable, owner and signal-group identities", async () => {
  const identity = await selfIdentity()
  for (const change of [{ starttime: String(BigInt(identity.starttime) + 1n) }, { inode: identity.inode + 1 },
    { device: identity.device + 1 }, { uid: identity.uid + 1 }, { group: identity.group + 1 },
    { session: identity.session + 1 }, { executable: "/foreign-executable" }]) {
    const sample = await sampleProcessResources({ owner: { kind: "command", id: "wrong-owner" }, identity: { ...identity, ...change } })
    expect(sample.verified).toBe(false)
    expect([sample.cpu, sample.rss_bytes]).toEqual([null, null])
    expect(sample.cgroup).toBeNull()
    expect(sample.errors).toContain("PROCESS_IDENTITY_UNVERIFIED")
  }
})

test("an exited actual process remains unknown rather than becoming a zero resource sample", async () => {
  const child = Bun.spawn([process.execPath, "-e", `import {readlink,stat} from "node:fs/promises";
console.log(JSON.stringify(await (${selfIdentity.toString()})()))`],
    { env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const identity: Awaited<ReturnType<typeof selfIdentity>> = JSON.parse(stdout)
  expect(identity.pid).toBe(child.pid)
  const sample = await sampleProcessResources({ identity, owner: { kind: "command", id: "exited-smoke" } })
  expect(sample.verified).toBe(false)
  expect([sample.cpu, sample.rss_bytes]).toEqual([null, null])
  expect(sample.errors).toContain("PROCESS_IDENTITY_UNVERIFIED")
})

async function selfIdentity() {
  const fields = (await Bun.file(`/proc/${process.pid}/stat`).text()).split(") ").at(-1)!.trim().split(/\s+/)
  const executable = await stat(`/proc/${process.pid}/exe`)
  return { pid: process.pid, starttime: fields[19]!, uid: process.getuid!(), parent: Number(fields[1]),
    group: Number(fields[2]), session: Number(fields[3]), executable: await readlink(`/proc/${process.pid}/exe`),
    device: executable.dev, inode: executable.ino }
}
