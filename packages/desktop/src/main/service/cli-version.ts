import path from "node:path"

export function parseCliVersion(output: string) {
  const marker = output.lastIndexOf(" v")
  const version = marker === -1 ? output : output.slice(marker + 2)

  if (!version) throw new Error("V2 CLI did not provide a version")

  return version
}

export function serviceVersion(input: {
  readonly channel: "local" | "dev" | "beta" | "prod"
  readonly isolated?: boolean
  readonly mode: "initial" | "reconnect"
  readonly version: string
}) {
  if (input.mode === "reconnect") return undefined

  if (input.channel === "beta" && !input.isolated) return undefined

  return input.version
}

// Retrying on timeout can also replace a server stuck in a migration longer than 120 s, which is accepted.
export function shouldRetryEnsure(version: string | undefined, message: string) {
  if (version !== undefined) return false

  return (
    message === "Background service failed to start" ||
    message === "Timed out waiting for the background service to start"
  )
}

export function stageName(version: string, arch = process.arch) {
  return `${version}-${arch}`.replace(/[^a-zA-Z0-9._-]/g, "-")
}

// Fork (catalog CAT-13): stages live in a directory 0.4 never had. 0.4 shares userData with the standalone CLI,
// whose profile is `<userData>/cli/profiles/default` (product cli-profile.ts).
export function stageDirectory(userData: string, version: string) {
  return path.join(userData, "cli-stages", stageName(version))
}

// Desktop builds for x64 and arm64 only, and Windows ARM64 runs both installers from one userData.
export function isStageName(name: string) {
  return /^[a-zA-Z0-9._-]+-(x64|arm64)$/.test(name)
}

export function keptStages(bundledVersion: string, runningVersion?: string, arch = process.arch) {
  const stages = [stageName(bundledVersion, arch)]

  if (runningVersion && runningVersion !== bundledVersion) stages.push(stageName(runningVersion, arch))

  return stages
}
