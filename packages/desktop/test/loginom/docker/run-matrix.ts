import { closeSync, openSync } from "node:fs"
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { createHash } from "node:crypto"

// Installed Linux matrix (PKG-01, PKG-02; LIFE-01 with --shutdown). Each target is a clean image of its system: the DEB
// installed by apt, or for an AppImage only the DEB's dependencies, the AppImage mounted and extracted by its own
// runtime (no FUSE in a container). The smoke runs as UID 1200 without network under Xvfb; `--shutdown <runs>` also runs
// shutdown-validation.mjs in each DEB image, in the home `--profile` gives (owned by UID 1200) or a clean one. Images
// are built by the classic builder without cache, so no BuildKit cache is left; after its target the image and every
// intermediate image of its build are removed (`--keep-images` keeps them), base images are not.
const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    artifact: { type: "string" },
    appimage: { type: "string" },
    output: { type: "string" },
    only: { type: "string" },
    "image-prefix": { type: "string" },
    shutdown: { type: "string" },
    profile: { type: "string" },
    "keep-images": { type: "boolean" },
  },
  strict: true,
}).values

if (!args.artifact || !args.output)
  throw Error(
    "Required: --artifact <deb> --output <report-directory> [--appimage <AppImage>] [--only <target>] [--image-prefix <own-prefix>] [--shutdown <runs> [--profile <home>]] [--keep-images]",
  )

const systems = {
  ubuntu22: "ubuntu:22.04",
  ubuntu24: "ubuntu:24.04",
  ubuntu26: "ubuntu:26.04",
  debian12: "debian:bookworm-slim",
  debian13: "debian:trixie-slim",
}

const targets = Object.entries(systems).flatMap(([name, base]) => [
  { name, base, kind: "deb" },
  ...(args.appimage ? [{ name: `${name}-appimage`, base, kind: "appimage" }] : []),
])

if (args.only && !targets.some((target) => target.name === args.only)) throw Error("Unknown matrix target")

const output = resolve(args.output)

await mkdir(output, { recursive: true })

const deb = resolve(args.artifact)

const appimage = args.appimage && resolve(args.appimage)

const control = async (field: string) => (await Bun.$`dpkg-deb -f ${deb} ${field}`.text()).trim()

// The package name is the channel's slug: the install directory, the executable and the state directory.
const slug = await control("Package")

const hash = async (file: string) =>
  createHash("sha256")
    .update(new Uint8Array(await Bun.file(file).arrayBuffer()))
    .digest("hex")

const artifactHash = { deb: await hash(deb), appimage: appimage ? await hash(appimage) : undefined }

const tests = resolve(import.meta.dir, "..")

type Report = (typeof targets)[number] & {
  status: "PASS" | "FAIL"
  phase: string
  exitCode: number
  shutdown?: { status: "PASS" | "FAIL"; exitCode: number; profile: boolean }
}

const reports: Report[] = []

const environment = { ...process.env, DOCKER_BUILDKIT: "0" }

const write = () =>
  Bun.write(join(output, "linux-matrix.json"), JSON.stringify({ artifactHash, slug, reports }, null, 2) + "\n")

for (const target of targets) {
  if (args.only && args.only !== target.name) continue
  const context = await mkdtemp(join(tmpdir(), "loginom-docker-context-"))
  const image = `${args["image-prefix"] ?? "loginom-agent-linux"}:${target.name}`

  try {
    await copyFile(join(import.meta.dir, "Dockerfile"), join(context, "Dockerfile"))

    if (target.kind === "deb") await copyFile(deb, join(context, "agent.deb"))
    else await Bun.write(join(context, "depends"), await control("Depends"))

    const buildCode = await logged(`${target.name}-build.log`, [
      "docker",
      "build",
      "--no-cache",
      "--build-arg",
      `BASE=${target.base}`,
      "--tag",
      image,
      context,
    ])

    if (buildCode !== 0) {
      reports.push({ ...target, status: "FAIL", phase: "install", exitCode: buildCode })
      await write()
      continue
    }

    const installed =
      target.kind === "deb"
        ? { root: `/opt/${slug}`, executable: `/opt/${slug}/${slug}`, prepare: "" }
        : {
            root: "/home/test-user/squashfs-root",
            executable: "/home/test-user/squashfs-root/AppRun",
            prepare: "/artifact/agent.AppImage --appimage-extract >/dev/null && ",
          }

    const run = (log: string, script: string, mounts: string[], extra: string[]) =>
      logged(log, [
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
        `type=bind,src=${tests},dst=/test,readonly`,
        ...(target.kind === "appimage"
          ? ["--mount", `type=bind,src=${appimage},dst=/artifact/agent.AppImage,readonly`]
          : []),
        ...mounts.flatMap((mount) => ["--mount", mount]),
        "--env",
        `LOGINOM_AI_AGENT_INSTALL_ROOT=${installed.root}`,
        "--env",
        `LOGINOM_AI_AGENT_EXECUTABLE=${installed.executable}`,
        "--env",
        `LOGINOM_AI_AGENT_TEST_SLUG=${slug}`,
        ...extra,
        image,
        "sh",
        "-c",
        `cd /home/test-user && ${installed.prepare}exec xvfb-run -a ${installed.root}/resources/loginom/bin/node ${script}`,
      ])

    const exitCode = await run(`${target.name}-smoke.log`, "/test/docker/installed-smoke.mjs", [], [])

    const report: Report = {
      ...target,
      status: exitCode === 0 ? "PASS" : "FAIL",
      phase: "offline-nonroot-launch",
      exitCode,
    }

    if (args.shutdown && target.kind === "deb") {
      const shutdownCode = await run(
        `${target.name}-shutdown.log`,
        "/test/shutdown-validation.mjs",
        args.profile ? [`type=bind,src=${resolve(args.profile)},dst=/home/test-user`] : [],
        ["--env", `LOGINOM_AI_AGENT_TEST_RUNS=${args.shutdown}`],
      )

      report.shutdown = {
        status: shutdownCode === 0 ? "PASS" : "FAIL",
        exitCode: shutdownCode,
        profile: !!args.profile,
      }

      if (shutdownCode !== 0) report.status = "FAIL"
    }

    reports.push(report)
    console.log(JSON.stringify(report))
    await write()
  } finally {
    await rm(context, { recursive: true, force: true })

    // The classic builder prints the image of every step as ` ---> <id>`, the first being the base image and the last the
    // tagged one. Removing the tagged image alone leaves its parents under the containerd image store, as does a failed
    // build: every step's image goes, newest first.
    const steps = [
      ...(
        await Bun.file(join(output, `${target.name}-build.log`))
          .text()
          .catch(() => "")
      ).matchAll(/^ ---> ([0-9a-f]{12})$/gm),
    ]

    if (!args["keep-images"])
      await logged(`${target.name}-cleanup.log`, [
        "docker",
        "image",
        "rm",
        ...steps
          .slice(1)
          .map((match) => match[1])
          .toReversed(),
      ])
  }
}

await write()

if (reports.some((report) => report.status !== "PASS")) process.exitCode = 1

async function logged(name: string, command: string[]) {
  const log = openSync(join(output, name), "w")
  const child = Bun.spawn(command, { stdout: log, stderr: log, env: environment })
  const code = await child.exited
  closeSync(log)

  return code
}
