import { onCleanup, onMount } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { proxyToastKey, type SystemProxyStatus } from "@/system-proxy"
import { showToast } from "@/utils/toast"

const shown = new Set<string>()

export function SystemProxyNotice() {
  const platform = usePlatform()
  const language = useLanguage()
  onMount(() => {
    if (!platform.getSystemProxyStatus) return
    const show = (status: SystemProxyStatus) => {
      for (const notice of status.notices) {
        const key = proxyToastKey(notice.code)
        if (!key || shown.has(notice.code)) continue
        shown.add(notice.code)
        showToast({
          title: language.t("systemProxy.notice.title"),
          description: language.t(key, { address: notice.detail ?? status.http ?? "" }),
        })
      }
    }
    void platform.getSystemProxyStatus().then(show).catch(() => undefined)
    const stop = platform.onSystemProxyStatus?.(show)
    onCleanup(() => stop?.())
  })
  return null
}
