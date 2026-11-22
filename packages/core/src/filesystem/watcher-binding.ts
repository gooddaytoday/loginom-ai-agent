import { createRequire } from "node:module"

declare const LOGINOM_AI_AGENT_LIBC: string | undefined

// Lazy: on workerd import.meta.url is undefined and the watcher is never
// loaded, so createRequire must not run at module scope.
export default function load() {
  const require = createRequire(import.meta.url)
  const libc = typeof LOGINOM_AI_AGENT_LIBC === "undefined" ? undefined : LOGINOM_AI_AGENT_LIBC
  return require(
    process.env.LOGINOM_AI_AGENT_PARCEL_WATCHER_PATH ??
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? `-${libc || "glibc"}` : ""}`,
  )
}
