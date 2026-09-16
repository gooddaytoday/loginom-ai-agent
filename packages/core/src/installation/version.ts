declare global {
  const LOGINOM_AI_AGENT_VERSION: string
  const LOGINOM_AI_AGENT_CHANNEL: string
}

export const InstallationVersion = typeof LOGINOM_AI_AGENT_VERSION === "string" ? LOGINOM_AI_AGENT_VERSION : "local"
export const InstallationChannel = typeof LOGINOM_AI_AGENT_CHANNEL === "string" ? LOGINOM_AI_AGENT_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
