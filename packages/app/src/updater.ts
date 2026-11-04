import type { Accessor } from "solid-js"

export type UpdateSettings = {
  enabled: boolean
  channel: "stable" | "unstable"
  managed: boolean
  channelLocked: boolean
}

export type UpdaterState = (
  | { status: "disabled" }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "downloading"; version: string; percent?: number }
  | { status: "ready"; version: string }
  | { status: "available"; version: string; url: string; notes?: string }
  | { status: "up-to-date" }
  | { status: "installing"; version: string }
  | { status: "error"; message: string }
) & { unsupported?: boolean; settings?: UpdateSettings; deferred?: boolean }

export type UpdaterPlatform = {
  state: Accessor<UpdaterState>
  check(): Promise<UpdaterState>
  install(): Promise<void>
  setChannel?(channel: "stable" | "unstable"): Promise<UpdaterState>
}
