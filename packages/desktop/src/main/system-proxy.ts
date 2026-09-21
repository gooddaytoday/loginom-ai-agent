import { loadNativeProxy } from "@loginom-ai-agent/loginom-host/native-proxy"
import { loadSystemProxyEnvironment } from "@loginom-ai-agent/loginom-host/system-proxy"

export { systemProxyEnvironment } from "@loginom-ai-agent/loginom-host/system-proxy"

export function loadDesktopProxyEnvironment(environment: NodeJS.ProcessEnv, platform = process.platform) {
  if (platform === "darwin") return loadNativeProxy(environment, platform)
  return loadSystemProxyEnvironment(environment, platform)
}
