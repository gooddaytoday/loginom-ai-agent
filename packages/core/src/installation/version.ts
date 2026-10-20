declare global {
  const LOGINOM_AI_AGENT_VERSION: string
  const LOGINOM_AI_AGENT_CHANNEL: string
  const LOGINOM_AI_AGENT_BROWSER_RECOVERY: boolean
}

export const InstallationVersion = typeof LOGINOM_AI_AGENT_VERSION === "string" ? LOGINOM_AI_AGENT_VERSION : "local"
export const InstallationChannel = typeof LOGINOM_AI_AGENT_CHANNEL === "string" ? LOGINOM_AI_AGENT_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
// Baked by release builds only; launchers still require a verified bundle or packaged Desktop.
export const InstallationBrowserRecovery =
  typeof LOGINOM_AI_AGENT_BROWSER_RECOVERY === "boolean" ? LOGINOM_AI_AGENT_BROWSER_RECOVERY : false
