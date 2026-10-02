import { rm } from "node:fs/promises"

// A fulfilled bridge reply can still report retained resources. It must not
// become a successful private close ACK or erase the profile used for recovery.
export async function closeManagedResources(state, requests) {
  await Promise.allSettled([...requests])
  const results = await Promise.allSettled([Promise.resolve().then(() => state.client?.close())])
  if (state.bridge) {
    const bridge = await Promise.allSettled([Promise.resolve().then(() => state.bridge.close())])
    if (bridge[0].status !== "fulfilled" || bridge[0].value?.browser_transport_closed !== true
      || bridge[0].value.browser_process_terminated !== true || bridge[0].value.clipboard_leases_retained !== 0)
      throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
  }
  for (const handle of [state.browserServer, state.browser])
    results.push(...(await Promise.allSettled([Promise.resolve().then(() => handle?.close())])))
  if (state.browserProfile)
    results.push(...(await Promise.allSettled([rm(state.browserProfile, { recursive: true, force: true })])))
  if (results.some((result) => result.status === "rejected")) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
}
