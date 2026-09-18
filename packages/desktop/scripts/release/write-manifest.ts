import { parseArgs } from "node:util"
import { join, resolve } from "node:path"
import { readdir, writeFile } from "node:fs/promises"
import { $ } from "bun"
import { Product, productName, productSlug } from "@loginom-ai-agent/product"
import { decodeManifest, fileHash, hash } from "./manifest"
import pins from "../../../product/loginom-release.json"

const args = parseArgs({
  args: process.argv.slice(2),
  options: Object.fromEntries(
    ["target", "version", "channel", "dist", "resources", "output"].map((key) => [key, { type: "string" as const }]),
  ),
  strict: true,
}).values
if (
  !["linux-x64", "darwin-arm64"].includes(args.target ?? "") ||
  !args.version ||
  !["dev", "beta", "prod"].includes(args.channel ?? "") ||
  !args.dist ||
  !args.resources ||
  !args.output
)
  throw Error(
    "Required: --target linux-x64|darwin-arm64 --version <version> --channel dev|beta|prod --dist <directory> --resources <directory> --output <file>",
  )
const mac = args.target === "darwin-arm64"
const channel = args.channel as "dev" | "beta" | "prod"
const root = resolve(import.meta.dir, "../../../..")
const dirty = !!(await $`git status --porcelain --untracked-files=all`.cwd(root).text()).trim()
// A published candidate must be reproducible, including every previously untracked build input.
if (dirty) throw Error("Commit the complete build inputs before writing the release manifest")
const resources = resolve(args.resources)
const catalog = await Bun.file(join(resources, "runtime/client/node_modules/playwright-core/browsers.json")).json()
const electron = resolve(
  import.meta.dir,
  "../../node_modules/electron/dist",
  mac ? "Electron.app/Contents/MacOS/Electron" : "electron",
)
const electronVersions = JSON.parse(
  await $`${electron} -p ${"JSON.stringify(process.versions)"}`
    .env({ ...process.env, ELECTRON_RUN_AS_NODE: "1" })
    .text(),
)
const artifacts = await Promise.all(
  (await readdir(args.dist))
    .filter(
      (name) =>
        name.endsWith("-source.tar.gz") ||
        (mac ? name.endsWith(".dmg") || name.endsWith(".zip") : name.endsWith(".deb") || name.endsWith(".AppImage")),
    )
    .sort()
    .map(async (file) => ({
      file,
      kind: file.endsWith(".deb")
        ? "deb"
        : file.endsWith(".AppImage")
          ? "appimage"
          : file.endsWith(".dmg")
            ? "dmg"
            : file.endsWith(".zip")
              ? "zip"
              : "source",
      bytes: Bun.file(join(args.dist!, file)).size,
      sha256: await fileHash(join(args.dist!, file)),
    })),
)
if (mac && !["dmg", "zip"].every((kind) => artifacts.some((file) => file.kind === kind)))
  throw Error("Both DMG and ZIP are required")
if (!artifacts.some((file) => file.kind === "source")) throw Error("Corresponding source archive is required")
const source = await fileHash(join(root, "docs/migration/source-map.json"))
const manifest = decodeManifest({
  schemaVersion: 1,
  version: args.version,
  channel,
  builtAt: new Date().toISOString(),
  source: {
    commit: (await $`git rev-parse HEAD`.cwd(root).text()).trim(),
    dirty: false,
    patchSha256: null,
    inputsManifestSha256: hash(JSON.stringify(pins)),
    importSha256: source,
  },
  target: {
    platform: mac ? "darwin" : "linux",
    arch: mac ? "arm64" : "x64",
    minimumOS: mac ? "14.0" : "Ubuntu 22.04; Debian 12",
    backend: "v1",
  },
  build: {
    os: process.platform,
    arch: process.arch,
    bun: Bun.version,
    lockSha256: await fileHash(join(root, "bun.lock")),
  },
  runtime: {
    electron: electronVersions.electron,
    electronNode: electronVersions.node,
    node: pins.nodeVersion,
    playwright: pins.playwright,
    playwrightMcp: pins.playwrightMcp,
    chromiumVersion: catalog.browsers.find((item: { name: string }) => item.name === "chromium").browserVersion,
    chromiumRevision: pins.chromiumRevision,
    catalogSha256: pins.actionManifestSha256,
    resourcesSha256: await fileHash(join(resources, "resource-manifest.json")),
  },
  product: {
    name: productName(channel),
    appId: Product.channels[channel],
    executable: productSlug(channel),
    uriScheme: Product.scheme,
  },
  paths: mac
    ? {
        executor: "Contents/Resources/loginom/runtime/src/managed-entry.mjs",
        node: "Contents/Resources/loginom/bin/node",
        chromium:
          "Contents/Resources/loginom/" + (await Bun.file(join(resources, "resource-manifest.json")).json()).browser,
        config: `~/Library/Application Support/${Product.channels[channel]}`,
        data: "${XDG_DATA_HOME:-~/.local/share}/" + productSlug(channel),
        cache: "${XDG_CACHE_HOME:-~/.cache}/" + productSlug(channel),
        state: `${"${XDG_STATE_HOME:-~/Library/Application Support/"}${Product.channels[channel]}}/${productSlug(channel)}`,
        logs: `~/Library/Application Support/${Product.channels[channel]}/logs`,
        profiles: `~/Library/Application Support/${Product.channels[channel]}/loginom/runtime`,
        secretStore: "electron-safeStorage-keychain",
      }
    : {
        executor: "resources/loginom/runtime/src/managed-entry.mjs",
        node: "resources/loginom/bin/node",
        chromium: `resources/loginom/browsers/chromium-${pins.chromiumRevision}/chrome-linux64/chrome`,
        config: `${"${XDG_CONFIG_HOME:-~/.config}"}/${Product.channels[channel]}`,
        data: "${XDG_DATA_HOME:-~/.local/share}/" + productSlug(channel),
        cache: "${XDG_CACHE_HOME:-~/.cache}/" + productSlug(channel),
        state:
          "${XDG_STATE_HOME:-${XDG_CONFIG_HOME:-~/.config}/" + Product.channels[channel] + "}/" + productSlug(channel),
        logs: `${"${XDG_CONFIG_HOME:-~/.config}"}/${Product.channels[channel]}/logs`,
        profiles: `${"${XDG_CONFIG_HOME:-~/.config}"}/${Product.channels[channel]}/loginom/runtime`,
        secretStore: "plaintext-private-0600",
      },
  connection: { schemaVersion: 1, generationProtocol: 1, knowledgeEndpoint: pins.endpoint },
  updater: { feed: Product.updateFeed, channel, previousVersion: null },
  signing: { status: mac ? "ad-hoc" : "unsigned", identity: mac ? "-" : null, notarized: false },
  installation: {
    scope: mac ? "user" : "machine",
    uninstallPolicy: mac
      ? "Remove the application bundle; user profiles and credentials are retained."
      : "DEB removes application files and retains user data. AppImage is a portable user-owned file.",
    preservesUserData: true,
  },
  validation: {
    commands: [
      {
        cwd: "packages/desktop",
        argv: [
          "bun",
          "test",
          "src/main/loginom",
          "electron-builder.config.test.ts",
          "scripts/release/artifact.test.ts",
        ],
      },
    ],
    reportFiles: mac
      ? ["static-dmg.json", "static-zip.json"]
      : ["static-deb.json", "static-appimage.json", "linux-matrix/linux-matrix.json"],
  },
  provenance: {
    licensesSha256: await fileHash(join(resources, "THIRD_PARTY_NOTICES.md")),
    migrationManifestSha256: source,
  },
  artifacts,
})
const body = JSON.stringify(manifest, null, 2) + "\n"
await writeFile(args.output, body)
await writeFile(args.output + ".sha256", hash(body) + "\n")
console.log(`Wrote ${args.output}: ${artifacts.length} hashed artifacts; ${manifest.signing.status}`)
