import { homedir } from "node:os"
import path from "node:path"
import { productChannel, productSlug } from "@loginom-ai-agent/product"

// Fork seam (catalog CAT-13, U5): Desktop looks for its background service in the registration file the CLI writes
// (`ServiceConfig.filename` in packages/cli), in the CLI's state root for the same product channel (`Global.Path.state`
// in packages/util). The build sets the channel to prod, beta or dev, as for the CLI it bundles (`latest` is prod).
const channel = productChannel(import.meta.env.LOGINOM_AI_AGENT_CHANNEL)

export const directory = productSlug(channel)

// Desktop's own service (B4.9, decision В-97 п. 7): a constant identity and a constant port for each channel, so the
// window finds only `service-desktop.json` of its channel, never the `service.json` of another product, the service of
// a CLI profile or another channel's Desktop. The ports are below 0x7000, where Windows folds ports of services without
// an identity, outside the CLI profiles' 0x6000-0x6bff (`cliProfileService` in packages/product) and outside every port
// IANA or common software lists (journal B4.9). A foreign program on the port stops the service with the CLI's error.
const identity = "desktop"

const port = { prod: 0x6e80, beta: 0x6e81, dev: 0x6e82 }[channel]

// What the product CLI's entry sets for every process it starts (`cli/src/profile.ts`, `cli/src/standalone.ts`), besides
// the identity and port `serviceEnvironment` replaces. A window started from a profile's terminal or tool inherits them,
// and its service would open the profile's directories, config and database, or hide its browser. The client lays `env`
// over this process's environment and cannot remove a variable, so they leave this process when the entry imports this
// module: before `configureApplication`, whose onboarding test mode sets its own database.
const profile = [
  "LOGINOM_AI_AGENT_CLI_ROOT",
  "LOGINOM_AI_AGENT_CONFIG_DIR",
  "LOGINOM_AI_AGENT_DB",
  "LOGINOM_AI_AGENT_HEADLESS",
  "LOGINOM_AI_AGENT_RUN_COMMAND",
]

profile.forEach((name) => delete process.env[name])

// Read at call time: the isolated development server moves XDG_STATE_HOME before it asks.
export function serviceFile() {
  const state = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state")

  return path.join(state, directory, `service-${identity}.json`)
}

/**
 * The data directory of Desktop's service, as the CLI takes it (`Global.Path.data` in packages/util): its Host keeps the
 * Loginom connection in `<data>/loginom` (B2.3). Read at call time, after the shell environment is in place, as the
 * service inherits it.
 */
export function serviceData() {
  const data = process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share")

  return path.join(data, directory)
}

/**
 * Stops Desktop's own service, the one registered in `serviceFile()`, when the app quits (B4.10): the stop request of
 * B2.3b first, which lets the service close its plugins and Loginom runtimes on Windows too, then SIGTERM and SIGKILL if
 * it does not answer or exit in time. The service of OpenCode, of a CLI profile or of another channel is not touched.
 */
export async function stopService() {
  const { Service } = await import("@opencode/client/service")

  await Service.stop({ file: serviceFile() })
}

/**
 * What Desktop adds to the environment its service inherits. Both U5 variables always, never only when unset: a window
 * started from a CLI profile's terminal inherits the profile's. The service's Host keys its resource verification cache
 * with `version`, as 0.4's Desktop Host did with `app.getVersion()`.
 */
export function serviceEnvironment(version: string) {
  return {
    LOGINOM_AI_AGENT_SERVICE_IDENTITY: identity,
    LOGINOM_AI_AGENT_SERVICE_PORT: String(port),
    LOGINOM_AI_AGENT_RESOURCE_VERSION: version,
  }
}
