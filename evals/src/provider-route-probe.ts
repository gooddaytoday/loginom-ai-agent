import path from "node:path"
import { lstat, realpath, writeFile } from "node:fs/promises"

/** Operator supplies a classified, zero-token timeout receipt; the product result stays immutable. */
export async function probeProviderRoute(input: { source: string; receipt: string; ledgerDir: string; url: string; apiKey: string }) {
  const source = await Bun.file(input.source).bytes()
  const failure = await new Response(source).json().catch(() => { throw Error("PROBE_SOURCE_REFUSED") }) as
    { kind: string; tokens: number; timeout_ms: number; attempt_sha256?: string } | null
  if (failure?.kind !== "provider_headers_timeout" || failure.tokens !== 0 || failure.timeout_ms !== 300_000 ||
    typeof failure.attempt_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(failure.attempt_sha256)) throw Error("PROBE_SOURCE_REFUSED")
  const url = new URL(input.url)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error("PROBE_ROUTE_REFUSED")
  const parent = path.dirname(input.receipt)
  const info = await lstat(parent)
  if (!path.isAbsolute(input.receipt) || await realpath(parent) !== parent || info.uid !== process.getuid?.() || info.mode & 0o077)
    throw Error("PROBE_RECEIPT_REFUSED")
  const ledger = await lstat(input.ledgerDir)
  if (!path.isAbsolute(input.ledgerDir) || await realpath(input.ledgerDir) !== input.ledgerDir || !ledger.isDirectory() ||
    ledger.isSymbolicLink() || ledger.uid !== process.getuid?.() || ledger.mode & 0o077) throw Error("PROBE_LEDGER_REFUSED")
  const base = { version: 2, operation: "provider_route_probe", attempt_sha256: failure.attempt_sha256, source_sha256: new Bun.CryptoHasher("sha256").update(source).digest("hex"),
    route_sha256: new Bun.CryptoHasher("sha256").update(url.href).digest("hex"), generation_verified: false, timeout_ms: 5_000 }
  // One assigned persistent ledger; copying evidence or changing the route cannot reset the attempt's allowance.
  await writeFile(path.join(input.ledgerDir, `${base.attempt_sha256}.json`), JSON.stringify({ ...base, status: "CONSUMED_BEFORE_DISPATCH" }), { flag: "wx", mode: 0o600 })
    .catch((error: NodeJS.ErrnoException) => { if (error.code === "EEXIST") throw Error("PROBE_ALREADY_ATTEMPTED"); throw error })
  await writeFile(input.receipt, JSON.stringify({ ...base, status: "ATTEMPTED" }), { flag: "wx", mode: 0o600 })
  const started = Date.now()
  const response = await fetch(url, { method: "HEAD", headers: { Authorization: `Bearer ${input.apiKey}` },
    redirect: "manual", signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
  const result = { ...base, status: response ? "HEADERS_RECEIVED" : "NO_HEADERS", http_status: response?.status ?? null,
    elapsed_ms: Date.now() - started }
  await response?.body?.cancel()
  await writeFile(input.receipt, JSON.stringify(result), { mode: 0o600 })
  return result
}
