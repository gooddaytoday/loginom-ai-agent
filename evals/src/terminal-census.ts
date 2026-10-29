import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

/** Pure observation, NOT an authenticated proof. The root publisher must establish
 * host proc/tick provenance and independently provision the finite exemptions.
 * No processes, threads, signals or retry are created by this function. */
export function terminalCensus(root: string, cutoff: string, exemptions: { pid: number; starttime: string }[]) {
  if (!decimal(cutoff) || exemptions.some(entry => !Number.isSafeInteger(entry.pid) || entry.pid < 1 || !decimal(entry.starttime)) ||
    new Set(exemptions.map(entry => entry.pid)).size !== exemptions.length) throw Error("TERMINAL_CENSUS_IDENTITY")
  const begin = performance.now(), before = counter(root)
  const names = readdirSync(root).filter(name => /^[1-9][0-9]*$/.test(name))
  const seen = new Set<number>()
  for (const name of names) {
    const pid = Number(name)
    if (!Number.isSafeInteger(pid) || seen.has(pid)) throw Error("TERMINAL_CENSUS_IDENTITY")
    seen.add(pid)
    const identity = groupIdentity(root, pid)
    const exempt = exemptions.find(entry => entry.pid === pid)
    if (exempt && exempt.starttime !== identity.birth) throw Error("TERMINAL_CENSUS_IDENTITY")
    // PF_KTHREAD is set by the kernel, unlike names or UID shared with userspace.
    if (!exempt && !(identity.flags & 0x00200000n) && BigInt(identity.birth) >= BigInt(cutoff)) throw Error("TERMINAL_CENSUS_LINEAGE")
  }
  for (const entry of exemptions)
    if (!seen.has(entry.pid) || groupIdentity(root, entry.pid).birth !== entry.starttime) throw Error("TERMINAL_CENSUS_IDENTITY")
  const after = counter(root), elapsedMs = performance.now() - begin
  if (before !== after || !Number.isFinite(elapsedMs) || elapsedMs > 1000 || elapsedMs < 0) throw Error("TERMINAL_CENSUS_FENCE")
  return { counter: before, counterAfter: after, groups: names.length, elapsedMs }
}

function counter(root: string) {
  const matches = [...readFileSync(path.join(root, "stat"), "utf8").matchAll(/^processes ([0-9]+)$/gm)]
  const value = matches[0]?.[1]
  if (matches.length !== 1 || !value || !decimal(value) || BigInt(value) >= 2n ** 63n) throw Error("TERMINAL_CENSUS_FENCE")
  return value
}

function groupIdentity(root: string, pid: number) {
  try {
    const text = readFileSync(path.join(root, String(pid), "stat"), "utf8")
    const end = text.lastIndexOf(") "), fields = text.slice(end + 2).trim().split(/\s+/)
    if (!text.startsWith(`${pid} (`) || end < 0 || !fields[19] || !decimal(fields[19]) || !fields[6] || !decimal(fields[6])) throw Error()
    return { birth: fields[19], flags: BigInt(fields[6]) }
  } catch { throw Error("TERMINAL_CENSUS_IDENTITY") }
}

function decimal(value: string) { return /^(0|[1-9][0-9]*)$/.test(value) }
