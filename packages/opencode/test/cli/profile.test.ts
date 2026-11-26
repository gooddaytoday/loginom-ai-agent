import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireProfile, systemWriterProbe } from "../../src/cli/profile"

const roots: string[] = []
const children: { kill(signal?: number | NodeJS.Signals): void }[] = []
async function temporary() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-profile-test-"))
  roots.push(root)
  return root
}
afterEach(async () => {
  children.splice(0).forEach((child) => child.kill("SIGKILL"))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

test("only one writer including a symlink alias; separate profiles remain independent", async () => {
  const root = await temporary()
  const first = await acquireProfile(path.join(root, "first"), "prod")
  await fs.symlink(first.paths.root, path.join(root, "alias"))
  await expect(acquireProfile(path.join(root, "alias"), "prod")).rejects.toThrow("PROFILE_BUSY")
  const second = await acquireProfile(path.join(root, "second"), "prod")
  await second.release()
  await first.release()
  const next = await acquireProfile(path.join(root, "alias"), "prod")
  expect(next.paths.root).toBe(first.paths.root)
  await next.release()
})

test("unknown existing data is rejected without installing a marker", async () => {
  const root = await temporary()
  await fs.writeFile(path.join(root, "desktop.db"), "untouched")
  await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_FORMAT_INVALID")
  expect(await fs.readdir(root)).toEqual(["desktop.db"])
  expect(await fs.readFile(path.join(root, "desktop.db"), "utf8")).toBe("untouched")
})

test("channel mismatch and escaped storage are rejected before backend imports", async () => {
  const root = await temporary()
  const first = await acquireProfile(root, "prod")
  await first.release()
  await expect(acquireProfile(root, "beta")).rejects.toThrow("PROFILE_FORMAT_INVALID")
  await fs.rmdir(first.paths.data)
  await fs.symlink(await temporary(), first.paths.data)
  await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_PATH_INVALID")
})

test("a foreign nonce is never removed and an abandoned guard is never stolen", async () => {
  const root = await temporary()
  const first = await acquireProfile(root, "prod")
  await fs.writeFile(path.join(root, ".writer", "owner"), "foreign")
  await expect(first.release()).rejects.toThrow("PROFILE_OWNER_CHANGED")
  await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_BUSY")
  expect(await fs.readFile(path.join(root, ".writer", "owner"), "utf8")).toBe("foreign")
})

test.skipIf(process.platform === "win32")("public profile root is rejected before any admission write", async () => {
  const root = await temporary()
  await fs.chmod(root, 0o755)
  await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
  expect(await fs.readdir(root)).toEqual([])
  expect((await fs.stat(root)).mode & 0o777).toBe(0o755)
})

test.skipIf(process.platform === "win32")(
  "existing shared storage is rejected without repairing permissions or retaining a guard",
  async () => {
    const root = await temporary()
    const first = await acquireProfile(root, "prod")
    await first.release()
    for (const directory of [
      first.paths.config,
      first.paths.data,
      first.paths.state,
      first.paths.cache,
      first.paths.tmp,
      first.paths.loginom,
    ]) {
      await fs.chmod(directory, 0o750)
      await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
      expect((await fs.stat(directory)).mode & 0o777).toBe(0o750)
      expect(await fs.readdir(root)).not.toContain(".writer")
      await fs.chmod(directory, 0o700)
    }
    const reopened = await acquireProfile(root, "prod")
    await reopened.release()
  },
)

// A separate CLI-like process that takes the profile and holds it.
const HOLDER = `
const { acquireProfile } = await import(process.env.PROFILE_MODULE)
const { spawn } = await import("node:child_process")
try {
  const held = await acquireProfile(process.env.PROFILE_ROOT, "prod")
  if (process.env.SURVIVOR_TMP) {
    // SURVIVOR_HOST imitates the forked host (an entry named node-host.mjs).
    const argv = process.env.SURVIVOR_HOST ? [process.execPath, process.env.SURVIVOR_HOST] : ["sleep", "600"]
    const child = spawn(argv[0], argv.slice(1), {
      env: { ...process.env, TMPDIR: process.env.SURVIVOR_TMP },
      stdio: "ignore",
      detached: true,
    })
    console.log("survivor " + child.pid)
  }
  console.log("held " + process.pid)
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.HOLD_MS)))
  await held.release()
  console.log("released")
} catch (error) {
  console.log(error.message)
}
`
function holder(root: string, env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "-e", HOLDER], {
    env: {
      ...process.env,
      PROFILE_MODULE: path.join(import.meta.dir, "../../src/cli/profile.ts"),
      PROFILE_ROOT: root,
      HOLD_MS: "600000",
      ...env,
    },
    stdout: "pipe",
    stderr: "inherit",
  })
  children.push(child)
  const reader = child.stdout.getReader()
  let text = ""
  return {
    child,
    async until(pattern: RegExp) {
      while (!pattern.test(text)) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error(`holder exited: ${text}`)
        text += new TextDecoder().decode(chunk.value)
      }
      return text
    },
  }
}

// The CLI was killed without releasing its guard (bh-x05: SIGKILL during configure).
async function abandoned(root: string, env: Record<string, string> = {}) {
  const owner = holder(root, env)
  const text = await owner.until(/held \d+/)
  owner.child.kill("SIGKILL")
  await owner.child.exited
  return { owner: await fs.readFile(path.join(root, ".writer", "owner"), "utf8"), text }
}

test("a guard of a killed CLI is taken over by the next start", async () => {
  const root = await temporary()
  await abandoned(root)
  const next = await acquireProfile(root, "prod")
  expect(JSON.parse(await fs.readFile(path.join(root, ".writer", "owner"), "utf8")).pid).toBe(process.pid)
  await next.release()
  expect(await fs.readdir(root)).not.toContain(".writer")
}, 30000)

test("a reused owner pid is not mistaken for the owner", async () => {
  const root = await temporary()
  const first = await acquireProfile(root, "prod")
  const file = path.join(root, ".writer", "owner")
  const owner = JSON.parse(await fs.readFile(file, "utf8"))
  // Same pid (this live process), different start: the recorded owner is gone.
  await fs.writeFile(file, JSON.stringify({ ...owner, start: 0, linux: owner.linux && { ...owner.linux, ticks: "1" } }))
  const next = await acquireProfile(root, "prod")
  expect(JSON.parse(await fs.readFile(file, "utf8")).nonce).not.toBe(owner.nonce)
  await expect(first.release()).rejects.toThrow("PROFILE_OWNER_CHANGED")
  await next.release()
}, 30000)

test("a live owner keeps the profile and is named in the refusal", async () => {
  const root = await temporary()
  const owner = holder(root)
  const pid = Number(/held (\d+)/.exec(await owner.until(/held \d+/))?.[1])
  const before = await fs.readFile(path.join(root, ".writer", "owner"), "utf8")
  const notices: string[] = []
  await expect(acquireProfile(root, "prod", { notice: (text) => notices.push(text) })).rejects.toThrow("PROFILE_BUSY")
  expect(notices.join("\n")).toContain(`process ${pid}`)
  expect(await fs.readFile(path.join(root, ".writer", "owner"), "utf8")).toBe(before)
}, 30000)

const FAST = { grace: 100, terminate: 200, confirm: 300 }

test("an owner that cannot be checked here is never taken over", async () => {
  const root = await temporary()
  const { owner } = await abandoned(root)
  const file = path.join(root, ".writer", "owner")
  const recorded = JSON.parse(owner)
  const { linux, ...withoutLinux } = recorded
  for (const replaced of [
    { ...recorded, host: "another-host" },
    { ...recorded, platform: process.platform === "linux" ? "darwin" : "linux" },
    { ...recorded, machine: "another-machine" },
    { ...recorded, machine: undefined },
    // Another boot of another installation is not proof that the owner is gone.
    { ...recorded, machine: "another-machine", linux: linux && { ...linux, boot: "another-boot" } },
    ...(process.platform === "linux"
      ? [
          withoutLinux,
          { ...recorded, linux: { ...linux, namespace: "pid:[1]" } },
          { ...recorded, linux: { ...linux, namespace: "pid:[1]", boot: "another-boot" } },
        ]
      : []),
  ]) {
    await fs.writeFile(file, JSON.stringify(replaced))
    const notices: string[] = []
    await expect(acquireProfile(root, "prod", { notice: (text) => notices.push(text) })).rejects.toThrow(
      "PROFILE_BUSY",
    )
    expect(notices.join("\n")).toContain("cannot be checked")
    expect(await fs.readFile(file, "utf8")).toBe(JSON.stringify(replaced))
  }
}, 30000)

test.skipIf(process.platform !== "linux")(
  "an owner from an earlier boot of this installation is gone",
  async () => {
    const root = await temporary()
    const { owner } = await abandoned(root)
    const recorded = JSON.parse(owner)
    await fs.writeFile(
      path.join(root, ".writer", "owner"),
      JSON.stringify({ ...recorded, linux: { ...recorded.linux, boot: "earlier-boot" } }),
    )
    const next = await acquireProfile(root, "prod")
    await next.release()
  },
  30000,
)

test("a failing probe keeps the guard", async () => {
  const root = await temporary()
  const { owner } = await abandoned(root)
  for (const probe of [
    {
      owner: async () => {
        throw new Error("probe failed")
      },
    },
    {
      survivors: async () => {
        throw new Error("probe failed")
      },
    },
  ]) {
    const notices: string[] = []
    await expect(
      acquireProfile(root, "prod", { probe, timing: FAST, notice: (text) => notices.push(text) }),
    ).rejects.toThrow("PROFILE_BUSY")
    expect(notices.join("\n")).toContain("remove")
    expect(await fs.readFile(path.join(root, ".writer", "owner"), "utf8")).toBe(owner)
  }
}, 30000)

test("a guard without an owner or with a crashed contender's claim stays busy and says what to do", async () => {
  const ownerless = await temporary()
  await fs.mkdir(path.join(ownerless, ".writer"), { mode: 0o700 })
  const claimed = await temporary()
  const { owner } = await abandoned(claimed)
  await fs.writeFile(path.join(claimed, ".writer", "takeover"), "crashed contender")
  for (const root of [ownerless, claimed]) {
    const notices: string[] = []
    await expect(acquireProfile(root, "prod", { timing: FAST, notice: (text) => notices.push(text) })).rejects.toThrow(
      "PROFILE_BUSY",
    )
    expect(notices.join("\n")).toContain(`remove ${path.join(await fs.realpath(root), ".writer")} and retry`)
  }
  expect(await fs.readFile(path.join(claimed, ".writer", "owner"), "utf8")).toBe(owner)
}, 30000)

test("a release blocked by a leftover claim fails with an instruction", async () => {
  const root = await temporary()
  const notices: string[] = []
  const held = await acquireProfile(root, "prod", { notice: (text) => notices.push(text) })
  await fs.writeFile(path.join(root, ".writer", "takeover"), "crashed contender")
  await expect(held.release()).rejects.toThrow("PROFILE_RELEASE_INCOMPLETE")
  expect(notices.join("\n")).toContain("takeover")
}, 30000)

test.skipIf(process.platform !== "linux")(
  "an unrecognised process of the killed run is never stopped and keeps the profile",
  async () => {
    const root = await temporary()
    await fs.mkdir(path.join(root, "cache", "tmp"), { recursive: true, mode: 0o700 })
    await fs.writeFile(
      path.join(root, "cli-profile.json"),
      JSON.stringify({ format: "loginom-cli", version: 1, channel: "prod" }),
      { mode: 0o600 },
    )
    const { text } = await abandoned(root, { SURVIVOR_TMP: path.join(root, "cache", "tmp") })
    const survivor = Number(/survivor (\d+)/.exec(text)?.[1])
    const notices: string[] = []
    await expect(acquireProfile(root, "prod", { timing: FAST, notice: (value) => notices.push(value) })).rejects.toThrow(
      "PROFILE_BUSY",
    )
    expect(notices.join("\n")).toContain(`${survivor} (sleep 600)`)
    expect(() => process.kill(survivor, 0)).not.toThrow()
    // Bounded wait: the takeover follows as soon as the last process exits.
    const timer = setTimeout(() => process.kill(survivor, "SIGKILL"), 300)
    const next = await acquireProfile(root, "prod", { timing: { grace: 10_000 }, notice: () => {} })
    clearTimeout(timer)
    await next.release()
  },
  30000,
)

test.skipIf(process.platform !== "linux")(
  "offline cleanup stops a recognised host that ignores SIGTERM, then takes over",
  async () => {
    const root = await temporary()
    const scripts = await temporary()
    const host = path.join(scripts, "node-host.mjs")
    await fs.writeFile(host, `process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)`)
    await fs.mkdir(path.join(root, "cache", "tmp"), { recursive: true, mode: 0o700 })
    await fs.writeFile(
      path.join(root, "cli-profile.json"),
      JSON.stringify({ format: "loginom-cli", version: 1, channel: "prod" }),
      { mode: 0o600 },
    )
    const { text } = await abandoned(root, { SURVIVOR_TMP: path.join(root, "cache", "tmp"), SURVIVOR_HOST: host })
    const survivor = Number(/survivor (\d+)/.exec(text)?.[1])
    // Wait until the imitated host has installed its SIGTERM handler (SigCgt bit 15).
    for (
      let caught = 0n;
      !(caught & (1n << 14n));
      caught = BigInt(`0x${/SigCgt:\s*([0-9a-f]+)/.exec(await fs.readFile(`/proc/${survivor}/status`, "utf8"))?.[1] ?? "0"}`)
    )
      await Bun.sleep(20)
    const signals: string[] = []
    const next = await acquireProfile(root, "prod", {
      timing: { grace: 200, terminate: 500, confirm: 5000 },
      notice: () => {},
      probe: {
        async signal(entry, signal) {
          signals.push(`${entry.pid} ${signal}`)
          return systemWriterProbe.signal(entry, signal)
        },
      },
    })
    expect(signals).toEqual([`${survivor} SIGTERM`, `${survivor} SIGKILL`])
    expect(() => process.kill(survivor, 0)).toThrow()
    await next.release()
  },
  30000,
)

test("a contender with a stale verdict never signals the fresh owner's processes", async () => {
  const root = await temporary()
  await abandoned(root)
  let intruder: Awaited<ReturnType<typeof acquireProfile>> | undefined
  const signals: number[] = []
  await expect(
    acquireProfile(root, "prod", {
      timing: { grace: 0, terminate: 0, confirm: 300 },
      notice: () => {},
      probe: {
        async survivors() {
          // Another start completes the cleanup and takes over meanwhile.
          intruder ??= await acquireProfile(root, "prod", { probe: { survivors: async () => [] } })
          return [{ pid: 2 ** 22 + 1, command: "node node-host.mjs", recognised: true, identity: "1" }]
        },
        async signal(entry) {
          signals.push(entry.pid)
          return false
        },
      },
    }),
  ).rejects.toThrow("PROFILE_BUSY")
  expect(signals).toEqual([])
  await intruder!.release()
}, 30000)

test("contenders released together at the swap admit exactly one writer", async () => {
  const root = await temporary()
  await abandoned(root)
  const count = 6
  let arrived = 0
  const barrier = Promise.withResolvers<void>()
  const outcomes = await Promise.allSettled(
    Array.from({ length: count }, () =>
      acquireProfile(root, "prod", {
        timing: FAST,
        notice: () => {},
        probe: {
          async survivors() {
            if (++arrived === count) barrier.resolve()
            await barrier.promise
            return []
          },
        },
      }),
    ),
  )
  const admitted = outcomes.filter((outcome) => outcome.status === "fulfilled")
  expect(admitted.length).toBe(1)
  expect(
    outcomes.filter((outcome) => outcome.status === "rejected" && outcome.reason.message === "PROFILE_BUSY").length,
  ).toBe(count - 1)
  await (admitted[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof acquireProfile>>>).value.release()
}, 30000)

test("concurrent starts on an abandoned guard admit exactly one writer", async () => {
  const root = await temporary()
  await abandoned(root)
  const contenders = Array.from({ length: 6 }, () => holder(root, { HOLD_MS: "3000" }))
  const outcomes = await Promise.all(contenders.map((contender) => contender.until(/(released|PROFILE_BUSY)/)))
  expect(outcomes.filter((text) => text.includes("released")).length).toBe(1)
  expect(outcomes.filter((text) => text.includes("PROFILE_BUSY")).length).toBe(5)
  expect(await fs.readdir(root)).not.toContain(".writer")
}, 60000)

test("a contender that judged the owner stale does not replace a fresh owner", async () => {
  const root = await temporary()
  await abandoned(root)
  let intruder: Awaited<ReturnType<typeof acquireProfile>> | undefined
  await expect(
    acquireProfile(root, "prod", {
      notice: () => {},
      probe: {
        async owner(owner) {
          if (intruder) return systemWriterProbe.owner(owner)
          // Another start takes over between this judgement and the swap.
          intruder = await acquireProfile(root, "prod")
          return "dead"
        },
      },
    }),
  ).rejects.toThrow("PROFILE_BUSY")
  expect(intruder).toBeDefined()
  await intruder!.release()
  expect(await fs.readdir(root)).not.toContain(".writer")
}, 30000)
