import { chmod, cp, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== "--out" || !args[1]) {
  console.error("Usage: bun run script/build-release.ts --out <dir>")
  process.exit(1)
}
const pkg = resolve(import.meta.dirname, "..")
const root = resolve(pkg, "../..")
const out = resolve(args[1])
const product = await Bun.file(join(root, "packages/product/loginom-release.json")).json()
const workspace = await Bun.file(join(root, "package.json")).json()
if (workspace.packageManager !== "bun@" + Bun.version) throw Error("Use the workspace's pinned Bun")
const node = await realpath(Bun.which("node") ?? "")

async function run(cmd: string[], cwd = pkg, env = process.env) {
  const child = Bun.spawn(cmd, { cwd, env, stdout: "inherit", stderr: "inherit" })
  if (await child.exited !== 0) throw Error("Command failed: " + cmd[0])
}
function imageArchiveEntries(archive: string) {
  const result = Bun.spawnSync(["tar", "-tf", archive], { stdout: "pipe", stderr: "inherit" })
  if (result.exitCode !== 0) throw Error("Cannot list saved image archive")
  const entries = result.stdout.toString().split("\n").map(name => name.replace(/^\.\//, ""))
  if (!entries.includes("manifest.json")) throw Error("Saved image archive is missing the Docker manifest")
  return entries
}
const version = Bun.spawnSync([node, "--version"], { stdout: "pipe" })
if (version.exitCode !== 0 || version.stdout.toString().trim() !== "v" + product.nodeVersion) throw Error("Use Product's pinned Node in PATH")
await run([process.execPath, "run", "build"])
const work = await mkdtemp(join(tmpdir(), "dashboard-release-"))
try {
  const context = join(work, "image")
  const release = join(work, "loginom-dashboard")
  await mkdir(join(context, "node-runtime/bin"), { recursive: true })
  await mkdir(join(context, "node-runtime/lib/node_modules"), { recursive: true })
  await mkdir(join(context, "template"))
  await mkdir(release)
  await cp(node, join(context, "node-runtime/bin/node"))
  const npm = join(dirname(dirname(node)), "lib/node_modules/npm")
  await cp(npm, join(context, "node-runtime/lib/node_modules/npm"), { recursive: true })
  await run(["tar", "-C", join(pkg, "template"), "--exclude=node_modules", "--exclude=dist", "-cf", join(work, "template.tar"), "."])
  await run(["tar", "-C", join(context, "template"), "--same-permissions", "-xf", join(work, "template.tar")])
  for (const name of ["server.mjs", "shell.js"]) {
    await run([node, "--check", join(pkg, "dist", name)])
    await cp(join(pkg, "dist", name), join(context, name))
  }
  await Bun.write(join(work, "user.npmrc"), "")
  await Bun.write(join(work, "global.npmrc"), "")
  await run([node, join(npm, "bin/npm-cli.js"), "ci", "--userconfig=" + join(work, "user.npmrc"), "--globalconfig=" + join(work, "global.npmrc"), "--ignore-scripts", "--no-audit", "--fund=false", "--workspaces=false", "--cache=" + join(context, "npm-cache")], join(context, "template"), {
    PATH: process.env.PATH, LANG: "C.UTF-8", NODE_USE_ENV_PROXY: "1",
    HTTP_PROXY: process.env.HTTP_PROXY, HTTPS_PROXY: process.env.HTTPS_PROXY, NO_PROXY: process.env.NO_PROXY,
  })
  await rm(join(context, "template/node_modules"), { recursive: true })
  await rm(join(context, "npm-cache/_logs"), { recursive: true, force: true })
  // The tag covers the shipped runtime and build kit, without a second version registry.
  const hash = new Bun.CryptoHasher("sha256")
  for (const name of ["server.mjs", "shell.js"]) hash.update(await Bun.file(join(context, name)).arrayBuffer())
  hash.update(product.nodeVersion)
  hash.update(await Bun.file(join(npm, "package.json")).arrayBuffer())
  hash.update(await Bun.file(join(pkg, "deploy/Dockerfile")).arrayBuffer())
  for (const name of [...new Bun.Glob("**/*").scanSync({ cwd: join(context, "template"), onlyFiles: true })].sort()) {
    hash.update(name)
    hash.update(await Bun.file(join(context, "template", name)).arrayBuffer())
  }
  const image = "loginom-dashboard:" + hash.digest("hex").slice(0, 16)
  await run(["docker", "build", "--network", "none", "-f", join(pkg, "deploy/Dockerfile"), "-t", image, context])
  const imageArchive = join(release, "image.tar")
  await run(["docker", "save", "-o", imageArchive, image])
  // Old Podman loads the supplementary OCI tag without its repository. Repack the Docker archive
  // without those entries: in-place tar deletion can corrupt Docker 28 exports.
  const ociMetadata = new Set(["index.json", "oci-layout"])
  if (imageArchiveEntries(imageArchive).some(name => ociMetadata.has(name))) {
    const unpacked = join(work, "image-unpacked")
    await mkdir(unpacked)
    await run(["tar", "-C", unpacked, "-xf", imageArchive])
    const dockerEntries = (await readdir(unpacked)).filter(name => !ociMetadata.has(name)).sort()
    await run(["tar", "-C", unpacked, "-cf", imageArchive, "--", ...dockerEntries])
    if (imageArchiveEntries(imageArchive).some(name => ociMetadata.has(name))) throw Error("Saved image archive still contains OCI metadata")
  }
  await Bun.write(join(release, "image.ref"), image + "\n")
  const files = ["containers.sh", "README.md", "compose-release.yaml", "check-release.mjs", "conmon-rotate.sh"]
  for (const name of files) await cp(join(pkg, "deploy", name), join(release, name))
  await chmod(join(release, "check-release.mjs"), 0o644)

  await Bun.write(join(release, "SHA256SUMS"), (await Promise.all([...files, "image.tar", "image.ref"].map(async name => {
    const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(join(release, name)).arrayBuffer()).digest("hex")
    return digest + "  " + name + "\n"
  }))).join(""))
  await mkdir(out, { recursive: true })
  const archive = join(out, image.replace(":", "-") + ".tar.gz")
  await run(["tar", "-C", work, "-czf", archive, "loginom-dashboard"])
  console.log("Release archive: " + archive)
} finally {
  await rm(work, { recursive: true, force: true })
}
