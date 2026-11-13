import type { CloudEndpoints } from "../src/cloud-auth"

// This input is consumed only by builders; runtime destinations are compiled literals.
export function cloudBuild(environment: NodeJS.ProcessEnv): CloudEndpoints | undefined {
  if (environment.LOGINOM_AI_AGENT_CLOUD_BUILD === undefined) return undefined
  if (environment.LOGINOM_AI_AGENT_CHANNEL !== "dev") throw Error("LOGINOM_CLOUD_BUILD_FORBIDDEN")
  try {
    const tuple: unknown = JSON.parse(environment.LOGINOM_AI_AGENT_CLOUD_BUILD)
    if (!tuple || typeof tuple !== "object" || Object.keys(tuple).sort().join(",") !== "primary,reserve,site")
      throw Error()
    for (const value of Object.values(tuple)) {
      if (typeof value !== "string" || !value.trim()) throw Error()
      const url = new URL(value)
      if (url.protocol !== "https:" || url.username || url.password) throw Error()
    }
    return tuple as CloudEndpoints
  } catch {
    // JSON and URL parser errors can contain credentials from invalid build inputs.
    throw Error("LOGINOM_CLOUD_BUILD_INVALID")
  }
}
