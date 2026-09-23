import { spawn } from "node:child_process"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

const directory = resolve(import.meta.dirname, "../..")
const electron = resolve(directory, "node_modules/electron/dist/electron")
const off = await launch({ LOGINOM_AI_AGENT_SYSTEM_PROXY: "off" })
try {
  const log = await waitForLog(off.root, "system proxy: off", 20_000)
  if (!log) throw new Error(`SYSTEM_PROXY_OFF_NOT_LOGGED\n${await readLogs(off.root)}`)
  console.log(JSON.stringify({ status: "PASS", case: "off" }))
} finally {
  await stop(off.child)
  await rm(off.root, { recursive: true, force: true })
}

const hungBin = await mkdtemp(join(tmpdir(), "loginom-proxy-gsettings-"))
const { writeFile, mkdir } = await import("node:fs/promises")
await mkdir(join(hungBin, "bin"))
await writeFile(join(hungBin, "bin", "gsettings"), "#!/bin/sh\n/bin/sleep 30\n", { mode: 0o755 })
const failed = await launch({
  XDG_CURRENT_DESKTOP: "GNOME",
  PATH: `${join(hungBin, "bin")}:${process.env.PATH ?? ""}`,
})
try {
  const log = await waitForLog(failed.root, "system proxy: failed", 20_000)
  if (!log) throw new Error(`SYSTEM_PROXY_FAILED_NOT_LOGGED\n${await readLogs(failed.root)}`)
  console.log(JSON.stringify({ status: "PASS", case: "reader-failed" }))
} finally {
  await stop(failed.child)
  await rm(failed.root, { recursive: true, force: true })
  await rm(hungBin, { recursive: true, force: true })
}

async function launch(env, args = []) {
  const root = await mkdtemp(join(tmpdir(), "loginom-system-proxy-"))
  const child = spawn(electron, [...args, directory], {
    cwd: directory,
    env: {
      ...process.env,
      ...env,
      LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
      LOGINOM_AI_AGENT_TEST_ROOT: root,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  return { child, root }
}

async function waitForLog(root, text, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const log = await readLogs(root)
    if (log.includes(text)) return log
    await delay(200)
  }
}

async function readLogs(root) {
  const files = []
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (entry.name.endsWith(".log")) files.push(path)
    }
  }
  await walk(join(root, "desktop", "logs"))
  const texts = await Promise.all(files.map((file) => readFile(file, "utf8").catch(() => "")))
  return texts.join("\n")
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill("SIGTERM")
  await Promise.race([onceExit(child), delay(5_000)])
  if (child.exitCode === null) child.kill("SIGKILL")
  await onceExit(child)
}

function onceExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) resolve()
    else child.once("exit", resolve)
  })
}
