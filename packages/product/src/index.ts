// Replaced by the bundler; runtime environment variables cannot redirect packaged updates.
declare const LOGINOM_AI_AGENT_UPDATE_FEED: string | null
declare const LOGINOM_AI_AGENT_UPDATE_GITHUB_API: string | null
declare const LOGINOM_AI_AGENT_UPDATE_GITHUB_DOWNLOAD: string | null

export const Product = Object.freeze({
  name: "Loginom AI Agent",
  slug: "loginom-ai-agent",
  namespace: "@loginom-ai-agent",
  envPrefix: "LOGINOM_AI_AGENT_",
  scheme: "loginom-ai-agent",
  executable: "loginom-ai-agent",
  cliExecutable: "loginom-ai-agent-cli",
  wordmark: "Loginom AI",
  // OpenCode base before product migration: d848db933^:packages/opencode/package.json.
  opencodeCompatibilityVersion: "1.18.31",
  database: "loginom-ai-agent.db",
  updateFeed: typeof LOGINOM_AI_AGENT_UPDATE_FEED === "undefined" ? null : LOGINOM_AI_AGENT_UPDATE_FEED || null,
  updateGithub:
    typeof LOGINOM_AI_AGENT_UPDATE_GITHUB_API !== "undefined" &&
    LOGINOM_AI_AGENT_UPDATE_GITHUB_API &&
    typeof LOGINOM_AI_AGENT_UPDATE_GITHUB_DOWNLOAD !== "undefined" &&
    LOGINOM_AI_AGENT_UPDATE_GITHUB_DOWNLOAD
      ? Object.freeze({ api: LOGINOM_AI_AGENT_UPDATE_GITHUB_API, download: LOGINOM_AI_AGENT_UPDATE_GITHUB_DOWNLOAD })
      : null,
  changelogFeed: null as string | null,
  documentation: "https://github.com/gooddaytoday/loginom-ai-agent#readme",
  support: "https://github.com/gooddaytoday/loginom-ai-agent/issues",
  artifactName: "loginom-ai-agent-${os}-${arch}.${ext}",
  knowledgeEndpoint: "https://mcp.loginom.ai/mcp",
  connection: Object.freeze({ url: "https://app.loginom.ai", username: "user" }),
  stores: Object.freeze({ settings: "loginom-ai-agent.settings", updater: "loginom-ai-agent.updater" }),
  config: Object.freeze({
    directory: ".loginom-ai-agent",
    json: "loginom-ai-agent.json",
    jsonc: "loginom-ai-agent.jsonc",
  }),
  channels: Object.freeze({
    prod: "com.loginom.aiagent",
    beta: "com.loginom.aiagent.beta",
    dev: "com.loginom.aiagent.dev",
  }),
  resources: Object.freeze({ runtime: "loginom", manifest: "resource-manifest.json" }),
})

export function productChannel(value: string | undefined) {
  return value === "prod" || value === "beta" ? value : "dev"
}

export function productSlug(channel: keyof typeof Product.channels) {
  return channel === "prod" ? Product.slug : `${Product.slug}-${channel}`
}

export function productName(channel: keyof typeof Product.channels) {
  if (channel === "prod") return Product.name
  return `${Product.name} ${channel === "beta" ? "Beta" : "Dev"}`
}
