import { LOOPBACK, mergeNoProxy } from "./bypass"
import { runtimeNoProxyKey } from "./environment"
import { resolveSystemProxy, type ResolveSystemProxyInput } from "./resolve"

export async function desktopServiceProxy(input: ResolveSystemProxyInput) {
  const result = await resolveSystemProxy(input)
  const noProxy = mergeNoProxy(LOOPBACK, input.environment ?? {}).join(",")
  const environment: Record<string, string> = result.environment
    ? { ...result.environment, [runtimeNoProxyKey]: noProxy }
    : { NO_PROXY: noProxy, ...((input.platform ?? process.platform) !== "win32" ? { no_proxy: noProxy } : {}) }
  return { environment, state: result.state, notices: result.notices.map((notice) => notice.code) }
}
