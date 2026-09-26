// Closing IPC/browser transport is only local cleanup. It never proves Loginom logout.
export async function closeManagedHandles({ client, bridge, browserServer, browser, removeProfile }) {
  const results = []
  for (const handle of [client, bridge, browserServer, browser]) {
    results.push(...await Promise.allSettled([Promise.resolve().then(async () => {
      const result = await handle?.close()
      if (handle === bridge && result?.browser_transport_closed === false)
        throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    })]))
  }
  if (removeProfile) results.push(...await Promise.allSettled([Promise.resolve().then(removeProfile)]))
  if (results.some((result) => result.status === "rejected")) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
}
