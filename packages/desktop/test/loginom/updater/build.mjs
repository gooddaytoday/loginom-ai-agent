import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { readFile, writeFile, rm, mkdir, cp } from "node:fs/promises"
import { join, resolve, isAbsolute } from "node:path"
import { createHash } from "node:crypto"
const project = resolve(import.meta.dirname, "../../..")
const root = process.env.LOGINOM_AI_AGENT_UPDATE_TEST_ROOT
if (!root || !isAbsolute(root)) throw Error("ABSOLUTE_UPDATE_TEST_ROOT_REQUIRED")
const require = createRequire(join(project, "package.json"))
const builderRequire = createRequire(require.resolve("electron-builder"))
const asar = createRequire(builderRequire.resolve("app-builder-lib"))("@electron/asar")
const feed = JSON.parse(await readFile(join(root, "feed.json"), "utf8")).url
const bun = process.env.LOGINOM_AI_AGENT_TEST_BUN ?? "bun"
const base = join(root, "base")
await mkdir(base, { recursive: true })
execFileSync("cp", ["-a", "--reflink=auto", join(project, "dist/linux-unpacked") + "/.", base])
for (const version of ["0.1.0", "0.1.1"]) {
  const packed = join(root, "packed-" + version),
    source = join(root, "source-" + version),
    output = join(root, "output-" + version)
  await rm(packed, { recursive: true, force: true })
  await rm(source, { recursive: true, force: true })
  await mkdir(packed, { recursive: true })
  execFileSync("cp", ["-al", base + "/.", packed])
  asar.extractAll(join(base, "resources/app.asar"), source)
  await rm(join(source, "out"), { recursive: true, force: true })
  await cp(join(project, "out"), join(source, "out"), { recursive: true })
  const main = join(source, "out/main/index.js")
  const code = await readFile(main, "utf8")
  if (code.split("updateFeed: null").length !== 2) throw Error("TEST_FEED_PATCH_AMBIGUOUS")
  await writeFile(main, code.replace("updateFeed: null", "updateFeed: " + JSON.stringify(feed)))
  const pkg = JSON.parse(await readFile(join(source, "package.json"), "utf8"))
  pkg.version = version
  await writeFile(join(source, "package.json"), JSON.stringify(pkg))
  await rm(join(packed, "resources/app.asar"))
  await rm(join(packed, "resources/app.asar.unpacked"), { recursive: true, force: true })
  await asar.createPackageWithOptions(source, join(packed, "resources/app.asar"), { unpack: "**/*" })
  await writeFile(
    join(packed, "resources/app-update.yml"),
    `provider: generic\nurl: ${feed}\nupdaterCacheDirName: loginom-ai-agent-updater\n`,
  )
  const builderConfig = join(root, "builder-" + version + ".json")
  await writeFile(
    builderConfig,
    JSON.stringify({
      appId: "com.loginom.aiagent",
      productName: "Loginom AI Agent",
      artifactName: "loginom-ai-agent-linux-x86_64.AppImage",
      publish: null,
      directories: { output },
      extraMetadata: { version, desktopName: "com.loginom.aiagent.desktop" },
      linux: {
        executableName: "loginom-ai-agent",
        category: "Office",
        icon: join(project, "resources/icons"),
        syncDesktopName: true,
        desktop: { entry: { StartupWMClass: "com.loginom.aiagent" } },
      },
    }),
  )
  execFileSync(
    bun,
    [
      "x",
      "electron-builder",
      "--linux",
      "AppImage",
      "--x64",
      "--prepackaged",
      packed,
      "--config=" + builderConfig,
      "--publish",
      "never",
    ],
    { cwd: project, env: { ...process.env, LOGINOM_AI_AGENT_CHANNEL: "prod" }, stdio: "inherit" },
  )
}
await mkdir(join(root, "payload"), { recursive: true })
const name = "loginom-ai-agent-linux-x86_64.AppImage"
await cp(join(root, "output-0.1.1", name), join(root, "payload", name))
const bytes = await readFile(join(root, "payload", name))
await writeFile(
  join(root, "payload.json"),
  JSON.stringify({ name, size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") }),
)
console.log("Both isolated updater fixtures built; production artifacts unchanged")
