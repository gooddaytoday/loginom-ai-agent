import { $ } from "bun"
import { constants, setPriority } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Product } from "@loginom-ai-agent/product"
import { prepareDevElectron } from "./dev-electron"

async function main() {
  process.env.LOGINOM_AI_AGENT_CHANNEL = "local"
  process.env.LOGINOM_AI_AGENT_VERSION ??= `2.0.0-local-${Date.now()}`
  process.env.LOGINOM_AI_AGENT_DISABLE_CHANNEL_DB = "0"
  const electron = selectElectronArgs()

  process.env.LOGINOM_AI_AGENT_DESKTOP_SERVER_CHANNEL = "local"
  process.env.LOGINOM_AI_AGENT_DESKTOP_ISOLATED_SERVER ??= "1"
  await prepareDesktop()
  await prepareServer()
  await startDesktop(electron)
}

async function prepareDesktop() {
  await Promise.all([
    $`bun run install-electron`,
    $`bun ./script/copy-icons.ts ${process.env.LOGINOM_AI_AGENT_CHANNEL ?? "dev"}`,
  ])

  if (process.platform === "darwin") process.env.ELECTRON_EXEC_PATH = await prepareDevElectron()
}

// Loginom AI Agent: development runs the CLI from packages/cli, as 0.4 did; none is downloaded from npm.
function selectElectronArgs() {
  const args = process.argv.slice(2)

  if (args.includes("--download-server"))
    throw new Error("--download-server is not supported: bun dev runs the CLI from packages/cli")

  return args.filter((arg) => arg !== "--build-server")
}

async function prepareServer() {
  buildWebUi()
  process.env.LOGINOM_AI_AGENT_DESKTOP_CLI_DEV = join(import.meta.dirname, "../../cli")

  if (process.platform !== "win32") return
  process.env.LOGINOM_AI_AGENT_DESKTOP_WSL_CLI_BUILD = join(import.meta.dirname, "../../cli/script/build.ts")
  process.env.LOGINOM_AI_AGENT_DESKTOP_WSL_CLI_OUTPUT = join(
    import.meta.dirname,
    `../resources/${Product.cliExecutable}-wsl`,
  )
}

// The source CLI serves packages/app/dist only to paired devices, and nothing on the way to the
// desktop window reads it, so it builds alongside startup instead of before it. Idle priority also
// lowers its disk and memory priority on Windows; below-normal still delayed the window by seconds.
function buildWebUi() {
  const started = performance.now()

  const build = Bun.spawn(["bun", "run", "build"], {
    cwd: join(import.meta.dirname, "../../app"),
    env: { ...process.env, VITE_OPENCODE_SERVER_MODE: "origin" },
    stdio: ["ignore", "ignore", "ignore"],
  })

  setPriority(build.pid, constants.priority.PRIORITY_LOW)
  build.unref()
  void build.exited.then((code) =>
    console.log(
      code === 0
        ? `Built the pairing web UI in ${((performance.now() - started) / 1000).toFixed(1)} s`
        : `Pairing web UI build failed with code ${code}; run 'bun run --cwd packages/app build' to see why`,
    ),
  )
}

async function startDesktop(args: string[]) {
  // Bun's implicit spawn environment omits values set during preparation.
  process.exitCode = await Bun.spawn(
    ["node", fileURLToPath(new URL("../bin/electron-vite.js", import.meta.resolve("electron-vite"))), "dev", ...args],
    { env: process.env, stdio: ["inherit", "inherit", "inherit"] },
  ).exited
}

await main()
