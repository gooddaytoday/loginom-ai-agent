// S6: inventory of outbound network attempts of the OpenCode 2 server (start, chat, idle) in a loopback-only network
// namespace, recorded with strace. Stock configuration vs the product's known knobs.
// Usage: bun s6.ts [idleSeconds]   (needs root for unshare -n)
import path from "node:path"
import { readFileSync, existsSync } from "node:fs"
import { report, SPIKE } from "./env"

const idle = process.argv[2] ?? "600"
const run = (mode: string, port: number) => {
  const trace = path.join(SPIKE, ".run", `s6-${mode}.strace`)
  const proc = Bun.spawn(["unshare", "-n", "sh", "-c", `ip link set lo up && bun ${path.join(import.meta.dir, "s6-inner.ts")} ${mode} ${port} ${idle} ${trace}`], { stdout: "inherit", stderr: "inherit" })
  return proc.exited.then((code) => ({ mode, code, trace }))
}

function analyse(trace: string) {
  const text = existsSync(trace) ? readFileSync(trace, "utf8") : ""
  const lines = text.split("\n")
  const external = new Map<string, number>()
  for (const line of lines.filter((l) => l.includes("connect("))) {
    const v4 = /sin_port=htons\((\d+)\), sin_addr=inet_addr\("([\d.]+)"\)/.exec(line)
    const v6 = /sin6_port=htons\((\d+)\).*inet_pton\(AF_INET6, "([^"]+)"/.exec(line)
    const hit = v4 ?? v6
    if (!hit) continue
    const address = hit[2]
    if (address.startsWith("127.") || address === "::1" || address === "0.0.0.0") continue
    const key = `${address}:${hit[1]}`
    external.set(key, (external.get(key) ?? 0) + 1)
  }
  // A resolver connects a UDP socket to port 53 and then sends without an address, so track those sockets per pid.
  const resolverSockets = new Set<string>()
  const dns = new Map<string, number>()
  for (const line of lines) {
    const pid = line.split(" ", 1)[0]
    const connect = /connect\((\d+), \{sa_family=AF_INET6?, sin6?_port=htons\(53\)/.exec(line)
    if (connect) resolverSockets.add(`${pid}:${connect[1]}`)
    const send = /send(?:to|msg)\((\d+), "/.exec(line)
    if (!send || !resolverSockets.has(`${pid}:${send[1]}`)) continue
    const labels = [...line.matchAll(/\\(\d{1,3})([A-Za-z0-9-]+)/g)].map((m) => m[2]).filter((label) => label.length > 1 && /[a-z]/i.test(label))
    if (labels.length < 2) continue
    const name = labels.join(".")
    dns.set(name, (dns.get(name) ?? 0) + 1)
  }
  return { traceLines: lines.length, externalConnects: Object.fromEntries(external), dnsQueries: Object.fromEntries(dns) }
}

const results = process.argv.includes("--analyse-only")
  ? ["stock", "target"].map((mode) => ({ mode, code: null, trace: path.join(SPIKE, ".run", `s6-${mode}.strace`) }))
  : await Promise.all([run("stock", 47200), run("target", 47210)])
const evidence = Object.fromEntries(results.map((r) => [r.mode, { exit: r.code, ...analyse(r.trace) }]))
const target = evidence.target as ReturnType<typeof analyse>
const clean = Object.keys(target.externalConnects).length === 0 && Object.keys(target.dnsQueries).length === 0
report("S6", clean ? "PASS" : "PARTIAL", { idleSeconds: Number(idle), ...evidence })
