import { ManagedFolders } from "@opencode/gui-plugins/managed-folders"
import { usePlatform } from "@/runtime/platform/platform"
import { usePluginHost } from "./host"

export function useManagedFolders() {
  const host = usePluginHost()
  const platform = usePlatform()
  return () => (platform.platform === "desktop" ? host.context("loginom-gui")?.main(ManagedFolders) : undefined)
}
