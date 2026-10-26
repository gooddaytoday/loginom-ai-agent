interface ImportMetaEnv {
  readonly LOGINOM_AI_AGENT_CHANNEL: string
  readonly LOGINOM_AI_AGENT_BROWSER_RECOVERY: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:loginom-ai-agent-server" {
  export const LoginomHost: typeof import("@loginom-ai-agent/loginom-host/adapter").LoginomHost
  export namespace Server {
    export const listen: typeof import("../../../opencode/dist/types/src/node").Server.listen
    export type Listener = import("../../../opencode/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../opencode/dist/types/src/node").Config.get
    export type Info = import("../../../opencode/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../opencode/dist/types/src/node").bootstrap
}
