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

// Read at call time: the isolated development server moves XDG_STATE_HOME before it asks.
export function serviceFile() {
  const state = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state")

  return path.join(state, directory, `service-${identity}.json`)
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
