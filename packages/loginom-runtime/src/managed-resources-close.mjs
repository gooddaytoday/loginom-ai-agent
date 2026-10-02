import { appendFile, rm } from "node:fs/promises"
import { join } from "node:path"

// A fulfilled bridge reply can still report retained resources. It must not
// become a successful private close ACK or erase the profile used for recovery.
export async function closeManagedResources(state, requests) {
  // Snapshot synchronously: the caller registers the close request itself only
  // after this function yields. It must never become part of its own drain.
  const admitted = [...requests]
  // Private stage evidence only; a diagnostic write cannot certify or prevent
  // cleanup. Never persist exception messages or browser/credential contents.
  const record = async (stage, status) => {
    if (!state.session?.directory) return
    await appendFile(join(state.session.directory, "resource-close.jsonl"),
      JSON.stringify({ version: 1, stage, status, recorded_at: new Date().toISOString() }) + "\n",
      { mode: 0o600 }).catch(() => undefined)
  }
  await record("drain", "started")
  await Promise.allSettled(admitted)
  await record("drain", "fulfilled")
  await record("client", "started")
  const results = await Promise.allSettled([Promise.resolve().then(() => state.client?.close())])
  await record("client", results[0].status)
  if (state.bridge) {
    await record("bridge", "started")
    const bridge = await Promise.allSettled([Promise.resolve().then(() => state.bridge.close())])
    await record("bridge", bridge[0].status)
    if (bridge[0].status !== "fulfilled" || bridge[0].value?.browser_transport_closed !== true
      || bridge[0].value.browser_process_terminated !== true || bridge[0].value.clipboard_leases_retained !== 0) {
      await record("bridge_ack", "rejected")
      throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    }
    await record("bridge_ack", "fulfilled")
  }
  for (const [stage, handle] of [["browser_server", state.browserServer], ["browser", state.browser]]) {
    await record(stage, "started")
    const closed = await Promise.allSettled([Promise.resolve().then(() => handle?.close())])
    results.push(...closed)
    await record(stage, closed[0].status)
  }
  if (state.browserProfile) {
    await record("profile", "started")
    const removed = await Promise.allSettled([rm(state.browserProfile, { recursive: true, force: true })])
    results.push(...removed)
    await record("profile", removed[0].status)
  }
  await record("complete", results.some((result) => result.status === "rejected") ? "rejected" : "fulfilled")
  if (results.some((result) => result.status === "rejected")) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
}
