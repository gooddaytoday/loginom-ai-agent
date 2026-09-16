export const Product = Object.freeze({
  name: "Loginom AI Agent",
  slug: "loginom-ai-agent",
  namespace: "@loginom-ai-agent",
  envPrefix: "LOGINOM_AI_AGENT_",
  scheme: "loginom-ai-agent",
  executable: "loginom-ai-agent",
  database: "loginom-ai-agent.db",
  updateFeed: null as string | null,
  changelogFeed: null as string | null,
  documentation: "https://github.com/gooddaytoday/loginom-ai-agent#readme",
  support: "https://github.com/gooddaytoday/loginom-ai-agent/issues",
  artifactName: "loginom-ai-agent-${os}-${arch}.${ext}",
  knowledgeEndpoint: "https://loginom.duckdns.org/mcp",
  connection: Object.freeze({ url: "http://logi-test-plan.bg.local/app/", username: "user" }),
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
