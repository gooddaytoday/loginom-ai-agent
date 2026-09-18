import { verifyLinuxPermissions } from "../linux-permissions"
import { parseArgs } from "node:util"
import { basename, join, resolve } from "node:path"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { $ } from "bun"
import { decodeManifest, fileHash, verifyResourceTree, verifyWindowsApplication } from "./manifest"
import { Product, productName, productSlug } from "@loginom-ai-agent/product"

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    manifest: { type: "string" },
    artifact: { type: "string" },
    unpacked: { type: "string" },
    report: { type: "string" },
  },
  strict: true,
}).values
if (!args.manifest || !args.artifact || !args.report)
  throw Error("Required: --manifest <json> --artifact <deb|AppImage|exe> [--unpacked <directory>] --report <json>")
const manifest = decodeManifest(await Bun.file(args.manifest).json())
if (
  manifest.product.name !== productName(manifest.channel) ||
  manifest.product.appId !== Product.channels[manifest.channel] ||
  manifest.product.executable !== productSlug(manifest.channel) ||
  manifest.product.uriScheme !== Product.scheme
)
  throw Error("RELEASE_IDENTITY_INVALID")
const artifact = manifest.artifacts.find((item) => item.file === basename(args.artifact!))
if (!artifact || artifact.bytes !== Bun.file(args.artifact).size || (await fileHash(args.artifact)) !== artifact.sha256)
  throw Error("RELEASE_ARTIFACT_HASH_MISMATCH")

if (manifest.target.platform === "win32") {
  if (artifact.kind !== "nsis" || !args.unpacked) throw Error("RELEASE_WINDOWS_PAYLOAD_REQUIRED")
  const installer = await readFile(args.artifact)
  if (installer.length < 64 || installer.subarray(0, 2).toString() !== "MZ") throw Error("RELEASE_INSTALLER_INVALID")
  const result = await verifyWindowsApplication(
    args.unpacked,
    manifest.product.executable,
    manifest.runtime.resourcesSha256,
  )
  await Bun.write(
    args.report,
    JSON.stringify(
      { status: "PASS", artifact: artifact.file, sha256: artifact.sha256, ...result, executableNotRun: true },
      null,
      2,
    ) + "\n",
  )
  console.log(`PASS static ${artifact.file}: ${result.files} resources`)
  process.exit(0)
}

const directory = await mkdtemp(join(tmpdir(), "loginom-static-"))
try {
  const root = join(directory, "extracted")
  if (artifact.kind === "deb") {
    const metadata = (
      await $`dpkg-deb --field ${resolve(args.artifact)} Package Version Architecture Depends`.text()
    ).trim()
    if (
      !metadata.includes(`Package: ${manifest.product.executable}\n`) ||
      !metadata.includes(`Version: ${manifest.version}\n`) ||
      !metadata.includes("Architecture: amd64\n") ||
      !metadata.includes("libasound2") ||
      !metadata.includes("libgbm1")
    )
      throw Error("RELEASE_DEB_METADATA_INVALID")
    await $`dpkg-deb --extract ${resolve(args.artifact)} ${root}`.quiet()
  } else if (artifact.kind === "appimage") {
    const bytes = await readFile(args.artifact)
    const offsets = []
    for (let position = bytes.indexOf("hsqs"); position !== -1; position = bytes.indexOf("hsqs", position + 4)) {
      if (
        position + 96 <= bytes.length &&
        bytes.readUInt16LE(position + 28) === 4 &&
        bytes.readUInt16LE(position + 30) === 0 &&
        Number(bytes.readBigUInt64LE(position + 40)) <= bytes.length - position
      )
        offsets.push(position)
    }
    if (offsets.length !== 1) throw Error("RELEASE_SQUASHFS_INVALID")
    await $`unsquashfs -no-progress -d ${root} -offset ${offsets[0]} ${resolve(args.artifact)}`.quiet()
  } else throw Error("Only Linux installer artifacts can be statically extracted")
  const application = artifact.kind === "deb" ? join(root, "opt", manifest.product.executable) : root
  await verifyLinuxPermissions(application)
  await verifyLinuxPermissions(
    artifact.kind === "deb"
      ? join(root, "usr/share/applications", `${manifest.product.appId}.desktop`)
      : join(root, `${manifest.product.appId}.desktop`),
  )
  const result = await verifyResourceTree(
    join(application, "resources/loginom"),
    manifest.runtime.resourcesSha256,
    "linux-x64",
  )
  const desktop = await readFile(
    artifact.kind === "deb"
      ? join(root, "usr/share/applications", `${manifest.product.appId}.desktop`)
      : join(root, `${manifest.product.appId}.desktop`),
    "utf8",
  )
  if (
    !desktop.includes(`Name=${manifest.product.name}`) ||
    !desktop.includes(`StartupWMClass=${manifest.product.appId}`)
  )
    throw Error("RELEASE_DESKTOP_IDENTITY_INVALID")
  if (
    artifact.kind === "deb" &&
    !desktop.includes(`Exec=/opt/${manifest.product.executable}/${manifest.product.executable} %U`)
  )
    throw Error("RELEASE_DESKTOP_EXEC_INVALID")
  await Bun.write(
    args.report,
    JSON.stringify(
      { status: "PASS", artifact: artifact.file, sha256: artifact.sha256, ...result, executableNotRun: true },
      null,
      2,
    ) + "\n",
  )
  console.log(`PASS static ${artifact.file}: ${result.files} resources`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
