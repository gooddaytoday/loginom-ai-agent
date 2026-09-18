import os from "node:os"
import path from "node:path"
import { Product } from "./index"

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
