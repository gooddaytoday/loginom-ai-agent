import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { Product } from "./index.js"

// Keep node:path out of the browser-facing Product entrypoint.
export function cliProfile(input: {
  channel: keyof typeof Product.channels
  root?: string
  platform?: NodeJS.Platform
  home?: string
  env?: NodeJS.ProcessEnv
}) {
  const platform = input.platform ?? process.platform
  const paths = platform === "win32" ? path.win32 : path.posix
  const env = input.env ?? process.env
  const home = input.home ?? os.homedir()
  const base =
    platform === "win32"
      ? (env.APPDATA ?? paths.join(home, "AppData", "Roaming"))
      : platform === "darwin"
        ? paths.join(home, "Library", "Application Support")
        : env.XDG_CONFIG_HOME || paths.join(home, ".config")
  const root = input.root ?? paths.join(base, Product.channels[input.channel], "cli", "profiles", "default")
  if (!paths.isAbsolute(root)) throw new Error("PROFILE_ROOT_INVALID")
  return profilePaths(paths.normalize(root), paths)
}

export function profilePaths(root: string, paths = path) {
  return {
    root,
    config: paths.join(root, "config"),
    data: paths.join(root, "data"),
    state: paths.join(root, "state"),
    cache: paths.join(root, "cache"),
    tmp: paths.join(root, "cache", "tmp"),
    loginom: paths.join(root, "loginom"),
  }
}

// The own service of a CLI profile (U5, decisions В-95 and В-97 п. 7). Its port is in 0x6000-0x6bff: below the 0x7000
// block that services without an identity fold into on Windows and below 0x8000, so it is the same on every platform,
// and clear of the port a `prod` build would take without an identity (13420). Each channel owns 1024 ports, so the
// default profiles of the channels never collide; the canonical root picks the port inside them, so other profiles and
// other users get other ports. Desktop takes its constant ports outside this range (B4.9). The registration lives in the
// profile's own state directory, so the identity only names it.
export function cliProfileService(root: string, channel: keyof typeof Product.channels) {
  const hash = createHash("sha256").update(root).digest()
  return {
    identity: `cli-${hash.toString("hex", 0, 4)}`,
    port: 0x6000 + 0x400 * { prod: 0, beta: 1, dev: 2 }[channel] + (hash.readUInt16BE(4) & 0x3ff),
  }
}
