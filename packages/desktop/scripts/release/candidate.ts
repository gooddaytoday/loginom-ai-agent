import { parseArgs } from "node:util"
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { $ } from "bun"
import { verifyCliManifest } from "@loginom-ai-agent/loginom-host/cli-manifest"
import { decodeManifest, verifyResourceTree } from "./manifest"

// B5.2b: verifies one platform's candidate artifacts downloaded from a loginom-{linux,windows,macos}.yml run. `prepare`
// takes the Desktop payload out of the installer, writes the release manifest from it and statically verifies every
// installer against the manifest. `g5` proves the CLI and Desktop resources are complete and that the check goes red
// when a file is missing.
const platforms = {
  linux: { target: "linux-x64", installers: [".deb", ".AppImage"], source: "source", cli: /-linux-x64\.tar\.gz$/ },
  windows: { target: "win32-x64", installers: [".exe"], source: "windows-source", cli: /-win32-x64\.zip$/ },
  macos: { target: "darwin-arm64", installers: [".dmg", ".zip"], source: "macos-source", cli: /-darwin-arm64\.tar\.gz$/ },
} as const
const manifestName = { linux: "release-manifest.json", windows: "windows-release-manifest.json", macos: "macos-release-manifest.json" }
const reportName = (file: string) =>
  file.endsWith(".deb")
    ? "static-deb.json"
    : file.endsWith(".AppImage")
      ? "static-appimage.json"
      : file.endsWith(".exe")
        ? "static-nsis.json"
        : file.endsWith(".dmg")
          ? "static-dmg.json"
          : "static-zip.json"
// A file the CLI artifact's manifest lists and the runtime cannot start without (B2.3).
const cliProbe = "resources/loginom/host/node-host.mjs"
// Listed in every resource-manifest.json: the managed Node (verifyResourceTree reports RELEASE_EXECUTABLE_MISSING).
const resourceProbe = (resources: string) => Bun.file(join(resources, "resource-manifest.json")).json().then((value) => value.node as string)

if (import.meta.main) {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      platform: { type: "string" },
      version: { type: "string" },
      channel: { type: "string" },
      downloads: { type: "string" },
      work: { type: "string" },
      output: { type: "string" },
      undamaged: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  })
  const platform = args.values.platform as keyof typeof platforms
  const work = args.values.work
  if (!platforms[platform] || !work || !args.positionals[0])
    throw Error("Required: prepare|g5 --platform linux|windows|macos --work <dir> --output <dir> (prepare also --version --channel --downloads)")
  if (args.positionals[0] === "g5" && args.values.output)
    await g5(platform, resolve(work), resolve(args.values.output), args.values.undamaged === true)
  else {
    const values = args.values
    if (!values.version || !values.channel || !values.downloads || !values.output) throw Error("Missing prepare options")
    await prepare(platform, resolve(work), values.version, values.channel, resolve(values.downloads), resolve(values.output))
  }
}

async function prepare(
  platform: keyof typeof platforms,
  work: string,
  version: string,
  channel: string,
  downloads: string,
  output: string,
) {
  const root = resolve(import.meta.dir, "../../../..")
  const config = platforms[platform]
  const files = (await readdir(downloads, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
  const installers = files.filter((file) => config.installers.some((suffix) => file.endsWith(suffix)))
  if (installers.length !== config.installers.length) throw Error(`Expected one of ${config.installers.join(", ")}: ${installers.join(", ")}`)
  const resources = await extractPayload(platform, installers, join(work, "payload"))

  const dist = join(work, "dist")
  await mkdir(dist, { recursive: true })
  await Promise.all(installers.map((file) => cp(file, join(dist, basename(file)))))
  // The corresponding source of the build is the commit itself.
  await $`git archive --format=tar.gz --prefix=loginom-ai-agent-${version}/ -o ${join(dist, `loginom-ai-agent-${version}-${config.source}.tar.gz`)} HEAD`.cwd(root)

  await mkdir(output, { recursive: true })
  const manifest = join(output, manifestName[platform])
  await $`bun ${join(import.meta.dir, "write-manifest.ts")} --target ${config.target} --version ${version} --channel ${channel} --dist ${dist} --resources ${resources} --output ${manifest}`.cwd(root)
  const decoded = decodeManifest(await Bun.file(manifest).json())
  if (decoded.source.commit !== (await $`git rev-parse HEAD`.cwd(root).text()).trim()) throw Error("RELEASE_COMMIT_MISMATCH")

  // Windows verification needs the unpacked application, two levels above resources/loginom.
  const unpacked = dirname(dirname(resources))
  for (const file of installers)
    await $`bun ${[
      join(import.meta.dir, "verify-artifact.ts"),
      ...["--manifest", manifest, "--artifact", file, "--report", join(output, reportName(file))],
      ...(platform === "windows" ? ["--unpacked", unpacked] : []),
    ]}`.cwd(root)

  const cli = files.filter((file) => config.cli.test(file))
  if (cli.length !== 1) throw Error(`Expected one CLI archive: ${cli.join(", ")}`)
  await Promise.all(
    [...decoded.artifacts.map((item) => join(dist, item.file)), cli[0], `${cli[0]}.sha256`, `${manifest}.sha256`].map((file) =>
      cp(file, join(output, basename(file))),
    ),
  )
  await Bun.write(join(work, "resources"), resources)
  await Bun.write(join(work, "cli-archive"), cli[0])
  console.log(`prepared ${platform} ${version}: ${decoded.artifacts.length} manifest artifacts`)
}

async function extractPayload(platform: keyof typeof platforms, installers: string[], directory: string) {
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  const installer = installers.find((file) => file.endsWith(platform === "linux" ? ".deb" : platform === "windows" ? ".exe" : ".zip"))!
  if (platform === "linux") await $`dpkg-deb --extract ${installer} ${directory}`.quiet()
  if (platform === "macos") await $`ditto -x -k ${installer} ${directory}`.quiet()
  if (platform === "windows") {
    // NSIS keeps the application in a 7z archive inside the installer.
    await $`7z x -y ${"-o" + directory} ${installer}`.quiet()
    const inner = (await readdir(directory, { recursive: true })).filter((entry) => entry.endsWith("app-64.7z"))
    if (inner.length !== 1) throw Error(`NSIS payload archive not found: ${(await readdir(directory)).join(", ")}`)
    await $`7z x -y ${"-o" + join(directory, "app")} ${join(directory, inner[0])}`.quiet()
  }
  const found = (await Array.fromAsync(new Bun.Glob("**/{resources,Resources}/loginom/resource-manifest.json").scan({ cwd: directory, onlyFiles: true })))
  if (found.length !== 1) throw Error(`Expected one resources/loginom in the installer payload, found ${found.length}`)
  return join(directory, dirname(found[0]))
}

async function g5(platform: keyof typeof platforms, work: string, output: string, undamaged: boolean) {
  const config = platforms[platform]
  const resources = await Bun.file(join(work, "resources")).text()
  const archive = await Bun.file(join(work, "cli-archive")).text()
  const manifest = decodeManifest(await Bun.file(join(output, manifestName[platform])).json())
  const cli = join(work, "cli")
  await rm(cli, { recursive: true, force: true })
  await mkdir(cli, { recursive: true })
  if (platform === "windows") await $`7z x -y ${"-o" + cli} ${archive}`.quiet()
  else await $`tar -xpzf ${archive} -C ${cli}`

  const verifyCli = async () => {
    const metadata = await verifyCliManifest(cli, { platform: process.platform, arch: process.arch, version: manifest.version })
    if (metadata.sourceCommit !== manifest.source.commit) throw Error("RELEASE_CLI_COMMIT_MISMATCH")
  }
  const verifyResources = () => verifyResourceTree(resources, manifest.runtime.resourcesSha256, config.target)
  await verifyCli()
  await verifyResources()
  console.log(`G5 ${platform}: CLI and Desktop resources complete`)
  await expectRed("CLI", join(cli, cliProbe), undamaged, verifyCli)
  await expectRed("Desktop", join(resources, await resourceProbe(resources)), undamaged, verifyResources)
  // The same checks are green again once the files are back: the red above came from the missing file.
  await verifyCli()
  await verifyResources()
}

// Moves `file` away, requires `check` to fail, and puts the file back. With `undamaged` the file stays: the control
// must then report that nothing turned red, which proves the control can fail.
export async function expectRed(name: string, file: string, undamaged: boolean, check: () => Promise<unknown>) {
  const moved = file + ".g5-removed"
  if (!undamaged) await rename(file, moved)
  const red = await check().then(
    () => false,
    () => true,
  )
  if (!undamaged) await rename(moved, file)
  if (!red) throw Error(`G5 control: the ${name} check stayed green${undamaged ? " (file not removed)" : " without " + basename(file)}`)
  console.log(`G5 ${name}: check is red without ${basename(file)}`)
}
