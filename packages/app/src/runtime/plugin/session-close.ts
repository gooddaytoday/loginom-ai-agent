import { BeforeSessionClose, type SessionCloseTarget } from "@opencode/plugin/gui/builtin"
import { usePluginHost } from "./host"

export function useBeforeSessionClose() {
  const host = usePluginHost()

  return async (targets: readonly SessionCloseTarget[]) => {
    for (const target of targets) {
      for (const item of host.items(BeforeSessionClose)) {
        try {
          if (!(await item.value.check(target))) return false
        } catch (error) {
          host.fail(item.plugin, error)

          return false
        }
      }
    }

    return true
  }
}
