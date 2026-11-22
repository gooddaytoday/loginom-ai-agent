interface ImportMetaEnv {
  readonly LOGINOM_AI_AGENT_CHANNEL: string
  readonly LOGINOM_AI_AGENT_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
