import path from "path"
import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import os from "os"
import { Context, Effect, Layer } from "effect"
import { Flock } from "./util/flock"
import { Flag } from "./flag/flag"
import { makeGlobalNode } from "./effect/app-node"
import { productChannel, productSlug } from "@loginom-ai-agent/product"
import { profilePaths } from "@loginom-ai-agent/product/cli-profile"

const app = productSlug(productChannel(process.env.LOGINOM_AI_AGENT_CHANNEL ?? "prod"))
// Only the standalone bootstrap sets CLI_ROOT, after acquiring its profile guard.
// The public CLI_PROFILE selector has no effect on Desktop imports.
const cli = process.env.LOGINOM_AI_AGENT_CLI_ROOT ? profilePaths(process.env.LOGINOM_AI_AGENT_CLI_ROOT) : undefined
const data = cli?.data ?? path.join(xdgData!, app)
const cache = cli?.cache ?? path.join(xdgCache!, app)
const config = cli?.config ?? path.join(xdgConfig!, app)
const state = cli?.state ?? path.join(xdgState!, app)
const tmp = cli?.tmp ?? path.join(os.tmpdir(), app)

const paths = {
  get home() {
    return process.env.LOGINOM_AI_AGENT_TEST_HOME ?? os.homedir()
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  repos: path.join(data, "repos"),
  cache,
  config,
  state,
  tmp,
}

export const Path = paths

Flock.setGlobal({ state })

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])

export class Service extends Context.Service<Service, Interface>()("@loginom-ai-agent/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.LOGINOM_AI_AGENT_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [] })

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )

export * as Global from "./global"
