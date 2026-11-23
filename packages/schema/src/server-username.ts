export * as ServerUsername from "./server-username.js"

// Loginom AI Agent (B2.7a11): the Basic user of the product's server, as in 0.4. The server, the CLI and Desktop read
// it here. The service probe and the terminal handoff of packages/client keep a copy (`username` in
// `service-probe.ts`): the client's Promise service entry bundles no module of `schema`. OpenCode's `opencode` is
// refused, since OpenCode clients are not supported.

/** The user when `LOGINOM_AI_AGENT_SERVER_USERNAME` is unset or empty. */
export const fallback = "loginom-ai-agent"

/**
 * The user a server accepts and a client sends. Read when called, so a module that imports `fallback` stays usable in
 * a browser. A server and the clients that share its environment (its service, a private server) agree on the value.
 */
export function current() {
  return process.env.LOGINOM_AI_AGENT_SERVER_USERNAME || fallback
}
