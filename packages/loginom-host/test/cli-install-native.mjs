import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import { promisify } from "node:util"

// Native acceptance: execute the archive's public installer as an ordinary user.
// Run in a dedicated Linux container with sudo and the pinned browser dependencies.
const artifact = process.env.LOGINOM_AI_AGENT_TEST_CLI_ARTIFACT
const evidence = process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS
assert.equal(process.platform, "linux")
assert.notEqual(process.getuid(), 0, "nonroot installation is required")
assert.ok(artifact && isAbsolute(artifact), "provide an absolute complete CLI artifact")
assert.ok(evidence && isAbsolute(evidence), "provide a new absolute evidence directory")
await mkdir(evidence)
const home = await mkdtemp(join(tmpdir(), "loginom-cli-install-"))
const env = {
  HOME: home,
  PATH: "/usr/bin:/bin",
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local/share"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TMPDIR: home,
  LANG: "C.UTF-8",
  LOGINOM_AI_AGENT_SYSTEM_PROXY: "off",
  LOGINOM_AI_AGENT_CLI_PROFILE: join(home, "profile"),
}
const execute = promisify(execFile)
const result = { status: "FAIL", uid: process.getuid(), artifact, home }
await writeFile(join(evidence, "roots.json"), JSON.stringify({ artifact, home, evidence }, null, 2))

async function run(label, command, args = []) {
  const output = await execute(command, args, { env, cwd: home, timeout: 180_000, maxBuffer: 2 ** 20 }).catch(
    async (error) => {
      await writeFile(join(evidence, label + ".log"), (error.stdout ?? "") + (error.stderr ?? ""))
      throw error
    },
  )
  await writeFile(join(evidence, label + ".log"), output.stdout + output.stderr)
  return output.stdout
}

try {
  const manifestBytes = await readFile(join(artifact, "cli-manifest.json"))
  const manifest = JSON.parse(manifestBytes)
  const sandboxRelative = "resources/loginom/browsers/chromium-1243/chrome-linux64/chrome-sandbox"
  const originalSandbox = await lstat(join(artifact, sandboxRelative))
  assert.equal(originalSandbox.mode & 0o7777, 0o4755)
  assert.notEqual(originalSandbox.uid, 0, "archive extraction must reproduce user-owned sandbox")
  const initial = JSON.parse(
    await run("profile-init", join(artifact, "bin/loginom-ai-agent-cli"), ["loginom", "status", "--format", "json"]),
  )
  assert.equal(initial.state, "unconfigured")
  const profile = env.LOGINOM_AI_AGENT_CLI_PROFILE
  await writeFile(join(profile, "data/keep"), "existing CLI profile", { mode: 0o600 })
  const installed = JSON.parse(await run("install", join(artifact, "install.sh")))
  const launcher = join(home, ".local/bin/loginom-ai-agent-cli")
  assert.equal(installed.launcher, launcher)
  assert.equal(
    installed.destination,
    join(home, ".local/share/loginom-ai-agent-cli", `${manifest.metadata.version}-${manifest.metadata.channel}`),
  )
  assert.equal(await readlink(launcher), join(installed.destination, "bin/loginom-ai-agent-cli"))
  assert.deepEqual(await readFile(join(installed.destination, "cli-manifest.json")), manifestBytes)
  const sandbox = await lstat(join(installed.destination, sandboxRelative))
  assert.equal(sandbox.uid, 0)
  assert.equal(sandbox.gid, 0)
  assert.equal(sandbox.mode & 0o7777, 0o4755)
  const status = JSON.parse(await run("status", launcher, ["loginom", "status", "--format", "json"]))
  assert.equal(status.state, "unconfigured")
  assert.equal(status.hasApiKey, false)
  const resources = join(installed.destination, "resources/loginom")
  // verifyResources binds process.execPath to this installed tree, not the archive's Node.
  await run("browser", join(resources, "bin/node"), [
    "--input-type=module",
    "-e",
    `import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { join } from "node:path"
const resources = process.argv[1]
const require = createRequire(join(resources, "runtime/client/package.json"))
const { chromium } = require("playwright-core")
const { verifyResources } = await import(join(resources, "runtime/src/resources.mjs"))
const verified = await verifyResources(resources)
const browser = await chromium.launch({ executablePath: verified.browserPath, headless: true, chromiumSandbox: true })
try {
  const page = await browser.newPage()
  await page.setContent("<title>Installed CLI browser</title>")
  assert.equal(await page.title(), "Installed CLI browser")
  console.log(JSON.stringify({ status: "PASS", node: process.execPath, manifestHash: verified.manifestHash, browserSandbox: true }))
} finally {
  await browser.close()
}`,
    resources,
  ])
  await run("uninstall", join(artifact, "uninstall.sh"))
  assert.equal(await readFile(join(profile, "data/keep"), "utf8"), "existing CLI profile")
  for (const file of [launcher, installed.destination, join(home, ".local/share/loginom-ai-agent-cli/current.json")]) {
    assert.equal(
      await lstat(file).then(
        () => true,
        (error) => (error.code === "ENOENT" ? false : Promise.reject(error)),
      ),
      false,
    )
  }
  Object.assign(result, {
    status: "PASS",
    sourceCommit: manifest.metadata.sourceCommit,
    sourceDirty: manifest.metadata.sourceDirty,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    sandbox: { uid: sandbox.uid, gid: sandbox.gid, mode: (sandbox.mode & 0o7777).toString(8) },
    browserSandbox: true,
    launcherStatus: status.state,
    profilePreserved: true,
    uninstalled: true,
  })
  console.log(JSON.stringify(result))
} catch (error) {
  result.error = error.message
  throw error
} finally {
  await writeFile(join(evidence, "result.json"), JSON.stringify(result, null, 2))
  await rm(home, { recursive: true, force: true })
}
