export * as SidecarCredentials from "./sidecar-credentials"

import { ServerUsername } from "@opencode/schema/server-username"
import type { ServerReadyData } from "../../shared/ipc-contract"

export type Data = ServerReadyData & { password: string | null }

// The renderer talks to the sidecar without an Authorization header; the main process adds it from
// here so GET requests stay CORS-simple and skip the preflight round trip. Both the initial connection
// and every reconnect publish the current endpoint.
let current: Data | undefined

const listeners = new Set<() => void>()

export function set(data: Data) {
  current = data
  listeners.forEach((listener) => listener())
}

export function get() {
  return current
}

/** Runs `listener` after each `set`: the first connection and every reconnect. Returns a function that stops it. */
export function onChange(listener: () => void) {
  listeners.add(listener)

  return () => void listeners.delete(listener)
}

/** What the renderer learns about the sidecar: its origin, never its credential. */
export function ready(data: Data): ServerReadyData {
  return { url: data.url }
}

/** The Basic credential for a request to the sidecar origin, or undefined for any other URL. */
export function authorization(sidecar: Data | undefined, url: string) {
  if (!sidecar?.password || !URL.canParse(url)) return

  if (new URL(url).origin !== sidecar.url) return

  return `Basic ${Buffer.from(`${ServerUsername.current()}:${sidecar.password}`).toString("base64")}`
}

/**
 * The Basic credential for a server of this build that is not Desktop's own service: one in WSL, over SSH or added by
 * the user (Loginom AI Agent, B2.7a11). Its environment is not Desktop's, so it keeps the default user, as the renderer
 * does (`authTokenFromCredentials` in packages/app).
 */
export function remote(password: string) {
  return `Basic ${Buffer.from(`${ServerUsername.fallback}:${password}`).toString("base64")}`
}
