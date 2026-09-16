import { openSync, closeSync } from "node:fs"
import { parseArgs } from "node:util"
import { copyFile, mkdtemp, mkdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"

const args = parseArgs({
  args: process.argv.slice(2),
  options: { artifact: { type: "string" }, output: { type: "string" }, only: { type: "string" } },
  strict: true,
}).values
if (!args.artifact || !args.output)
  throw Error(
    "Required: --artifact <deb> --output <report-directory> [--only ubuntu22|ubuntu24|ubuntu26|debian12|debian13]",
  )
const targets = {
  ubuntu22: "ubuntu:22.04",
  ubuntu24: "ubuntu:24.04",
  ubuntu26: "ubuntu:26.04",
  debian12: "debian:bookworm-slim",
  debian13: "debian:trixie-slim",
}
if (args.only && !(args.only in targets)) throw Error("Unknown matrix target")
const output = resolve(args.output)
await mkdir(output, { recursive: true })
const artifactHash = createHash("sha256")
  .update(new Uint8Array(await Bun.file(args.artifact).arrayBuffer()))
  .digest("hex")
const context = await mkdtemp(join(tmpdir(), "loginom-docker-context-"))
const reports = []
try {
  await copyFile(resolve(args.artifact), join(context, "loginom-ai-agent-linux-amd64.deb"))
  await copyFile(join(import.meta.dir, "Dockerfile"), join(context, "Dockerfile"))
  for (const [name, base] of Object.entries(targets)) {
    if (args.only && args.only !== name) continue
    const image = `loginom-agent-linux:${name}`
    const buildLog = openSync(join(output, `${name}-build.log`), "w")
    const build = Bun.spawn(["docker", "build", "--build-arg", `BASE=${base}`, "--tag", image, context], {
      stdout: buildLog,
      stderr: buildLog,
    })
    const buildCode = await build.exited
    closeSync(buildLog)
    if (buildCode !== 0) {
      reports.push({ name, base, status: "FAIL", phase: "install", exitCode: buildCode })
      continue
    }
    const runLog = openSync(join(output, `${name}-smoke.log`), "w")
    const run = Bun.spawn(
      [
        "docker",
        "run",
        "--init",
        "--rm",
        "--network",
        "none",
        "--shm-size=1g",
        "--security-opt",
        "seccomp=unconfined",
        "--security-opt",
        "apparmor=unconfined",
        "--mount",
        `type=bind,src=${import.meta.dir},dst=/test,readonly`,
        image,
      ],
      { stdout: runLog, stderr: runLog },
    )
    const exitCode = await run.exited
    closeSync(runLog)
    const report = { name, base, status: exitCode === 0 ? "PASS" : "FAIL", phase: "offline-nonroot-launch", exitCode }
    reports.push(report)
    console.log(JSON.stringify(report))
    await Bun.write(join(output, "linux-matrix.json"), JSON.stringify({ artifactHash, reports }, null, 2) + "\n")
  }
  await Bun.write(join(output, "linux-matrix.json"), JSON.stringify({ artifactHash, reports }, null, 2) + "\n")
  if (reports.some((report) => report.status !== "PASS")) process.exitCode = 1
} finally {
  await rm(context, { recursive: true, force: true })
}
