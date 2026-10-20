declare global {
  const LOGINOM_AI_AGENT_VERSION: string
  const LOGINOM_AI_AGENT_CHANNEL: string
  const LOGINOM_AI_AGENT_BROWSER_RECOVERY: string
}

export const InstallationVersion = typeof LOGINOM_AI_AGENT_VERSION === "string" ? LOGINOM_AI_AGENT_VERSION : "local"
export const InstallationChannel = typeof LOGINOM_AI_AGENT_CHANNEL === "string" ? LOGINOM_AI_AGENT_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
export const InstallationBrowserRecovery = typeof LOGINOM_AI_AGENT_BROWSER_RECOVERY === "string" && LOGINOM_AI_AGENT_BROWSER_RECOVERY === "1"
