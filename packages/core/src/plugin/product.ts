export * as PluginProduct from "./product.js"

// Fork seam U1 (catalog CAT-07): the Loginom AI Agent product plugin is built in, runs last in `post`, and its ID is
// guarded against config removals and reserved against packages that claim it.
import LoginomAgent from "@loginom-ai-agent/loginom-agent"
import type { InternalPlugin } from "./internal.js"
import { PluginPromise } from "./promise.js"

export const plugins: readonly InternalPlugin[] = [PluginPromise.fromPromise(LoginomAgent)]
export const ids: readonly string[] = plugins.map((plugin) => plugin.id)
