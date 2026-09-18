import { $ } from "bun"
import { dirname, join, resolve } from "node:path"
import { mkdir, readdir, readFile, stat } from "node:fs/promises"
import { decodeManifest, verifyContainedLinks, verifyResourceTree, relativePath } from "./manifest"

export async function verifyMacArtifact(input: {
  manifest: ReturnType<typeof decodeManifest>
  artifact: string
  kind: "dmg" | "zip"
  directory: string
}) {
  if (process.platform !== "darwin") throw Error("RELEASE_MAC_VERIFICATION_REQUIRES_MACOS")
  const root = join(input.directory, "extracted")
  await mkdir(root)
  if (input.kind === "dmg")
    await $`hdiutil attach -readonly -nobrowse -noautoopen -mountpoint ${root} ${resolve(input.artifact)}`.quiet()
  try {
    if (input.kind === "zip") {
      const listing = await $`unzip -Z1 ${resolve(input.artifact)}`.text()
      for (const entry of listing.trim().split("\n")) relativePath(entry.replace(/\/$/, ""))
      await $`ditto -x -k ${resolve(input.artifact)} ${root}`.quiet()
    }
    const apps = (await readdir(root)).filter((file) => file.endsWith(".app"))
    if (apps.length !== 1) throw Error("RELEASE_MAC_APPLICATION_INVALID")
    const application = join(root, apps[0])
    await verifyContainedLinks(application)
    const plist = JSON.parse(await $`plutil -convert json -o - ${join(application, "Contents/Info.plist")}`.text())
    if (
      plist.CFBundleIdentifier !== input.manifest.product.appId ||
      plist.CFBundleShortVersionString !== input.manifest.version ||
      plist.LSMinimumSystemVersion !== "14.0" ||
      plist.CFBundleDisplayName !== input.manifest.product.name
    )
      throw Error("RELEASE_MAC_IDENTITY_INVALID")
    relativePath(plist.CFBundleExecutable)
    const executable = join(application, "Contents/MacOS", plist.CFBundleExecutable)
    const resource = await verifyResourceTree(
      join(application, "Contents/Resources/loginom"),
      input.manifest.runtime.resourcesSha256,
      "darwin-arm64",
    )
    for (const file of [
      executable,
      join(application, input.manifest.paths.node),
      join(application, input.manifest.paths.chromium),
    ]) {
      const bytes = await readFile(file)
      if (
        bytes.length < 32 ||
        bytes.readUInt32LE(0) !== 0xfeedfacf ||
        bytes.readUInt32LE(4) !== 0x0100000c ||
        !((await stat(file)).mode & 0o111)
      )
        throw Error("RELEASE_EXECUTABLE_INVALID")
      if (file !== join(application, input.manifest.paths.chromium)) await $`codesign --verify --strict ${file}`.quiet()
      const commands = await $`otool -l ${file}`.text()
      const minimum =
        commands.match(/\bminos\s+(\d+(?:\.\d+)+)/)?.[1] ?? commands.match(/\bversion\s+(\d+(?:\.\d+)+)/)?.[1]
      if (
        !minimum ||
        Number(minimum.split(".")[0]) > 14 ||
        (Number(minimum.split(".")[0]) === 14 && Number(minimum.split(".")[1]) > 0)
      )
        throw Error("RELEASE_MAC_MINIMUM_OS_INVALID")
    }
    const chromiumSignature = await verifyMacBrowserSignature(join(application, input.manifest.paths.chromium))
    await $`codesign --verify --deep --strict ${application}`.quiet()
    const signature = await $`codesign -d -vv ${application}`.quiet()
    if (!signature.stderr.toString().includes("Signature=adhoc")) throw Error("RELEASE_MAC_SIGNATURE_INVALID")
    return { ...resource, minimumOS: "14.0", signing: "ad-hoc", vendorCodeSignaturesVerified: true, chromiumSignature }
  } finally {
    if (input.kind === "dmg") await $`hdiutil detach ${root}`.quiet()
  }
}

export async function verifyMacBrowserSignature(executable: string) {
  const bundle = dirname(dirname(dirname(executable)))
  const target = bundle.endsWith(".app") ? bundle : executable
  const details = (await $`codesign -d -vv ${target}`.quiet()).stderr.toString()
  // The pinned Chrome for Testing ships linker-signed code but no resource seal.
  // Verify those code pages without inventing/replacing an upstream bundle signature.
  // Resource integrity is checked separately against every staged SHA256 and the outer app seal.
  if (
    details.includes("linker-signed") &&
    details.includes("Signature=adhoc") &&
    details.includes("Sealed Resources=none")
  ) {
    await $`codesign --verify --deep --strict --ignore-resources ${target}`.quiet()
    return "linker-signed-code-only; resource seal absent upstream"
  }
  await $`codesign --verify --deep --strict ${target}`.quiet()
  return "bundle-and-code"
}
