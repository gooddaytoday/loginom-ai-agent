import { cp, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { resolveChannel } from "./utils"

export async function copyIcons(channel = resolveChannel(), packageDirectory = resolve(import.meta.dir, "..")) {
  const source = resolve(packageDirectory, "icons", channel)
  const destination = resolve(packageDirectory, "resources/icons")

  await rm(destination, { recursive: true, force: true })
  // Do not stage historical Android/iOS/Store images or mixed-platform PNGs.
  await Promise.all(
    ["linux", "icon.png", "icon.ico", "icon.icns", "dock.png"].map((name) =>
      cp(resolve(source, name), resolve(destination, name), { recursive: true }),
    ),
  )
  console.log(`Copied ${channel} icons from ${source} to ${destination}`)
}

if (import.meta.main) {
  const value = process.argv[2]
  await copyIcons(value === "dev" || value === "beta" || value === "prod" ? value : resolveChannel())
}
