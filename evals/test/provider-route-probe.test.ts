import { expect, test } from "bun:test"
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { probeProviderRoute } from "../src/provider-route-probe"

test("one bounded HEAD probe records route headers without generation secrets or a second probe", async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'evals-provider-probe-'))
 const calls:string[]=[]
 const server=Bun.serve({port:0,fetch:r=>{calls.push(r.method);return new Response('private-body',{status:401,headers:{'x-private':'secret-value'}})}})
 const receipt=path.join(root,'probe.json'),source=path.join(root,'timeout.json'),ledgerDir=path.join(root,'ledger')
 await mkdir(ledgerDir,{mode:0o700})
 await Bun.write(source,JSON.stringify({kind:'provider_headers_timeout',tokens:0,timeout_ms:300000,attempt_sha256:'a'.repeat(64)}))
 try {
  const result=await probeProviderRoute({source,receipt,ledgerDir,url:`http://127.0.0.1:${server.port}/v1`,apiKey:'private-key'})
  expect(result).toMatchObject({status:'HEADERS_RECEIVED',http_status:401,generation_verified:false})
  await expect(probeProviderRoute({source,receipt,ledgerDir,url:`http://127.0.0.1:${server.port}/v1`,apiKey:'private-key'})).rejects.toThrow('PROBE_ALREADY_ATTEMPTED')
  await expect(probeProviderRoute({source,receipt:receipt+'.another',ledgerDir,url:`http://127.0.0.1:${server.port}/v1`,apiKey:'private-key'})).rejects.toThrow('PROBE_ALREADY_ATTEMPTED')
  expect(calls).toEqual(['HEAD'])
  const saved=await readFile(receipt,'utf8');for(const secret of ['private-body','secret-value','private-key'])expect(saved).not.toContain(secret)
 }finally{server.stop(true);await rm(root,{recursive:true,force:true})}
})


test("unclassified failure cannot authorize a provider probe",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'evals-probe-source-'));
 try{
  const source=path.join(root,'source.json'),receipt=path.join(root,'probe.json');
  for(const failure of [{kind:'unknown',tokens:0,timeout_ms:300000,attempt_sha256:'a'.repeat(64)},{kind:'provider_headers_timeout',tokens:1,timeout_ms:300000,attempt_sha256:'a'.repeat(64)}]) {
   await Bun.write(source,JSON.stringify(failure));
   await expect(probeProviderRoute({source,receipt,ledgerDir:root,url:'http://127.0.0.1:1',apiKey:'fixture'})).rejects.toThrow('PROBE_SOURCE_REFUSED');
   expect(await Bun.file(receipt).exists()).toBe(false);
  }
 }finally{await rm(root,{recursive:true,force:true})}
});

test("copies of one incident share the probe allowance across delivery directories", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "evals-probe-copy-"))
 const calls: string[] = []
 const server = Bun.serve({ port: 0, fetch: request => { calls.push(request.method); return new Response(null, { status: 405 }) } })
 try {
  const ledgerDir = path.join(root, "ledger"), author = path.join(root, "author"), delivery = path.join(root, "delivery")
  for (const dir of [ledgerDir, author, delivery]) await mkdir(dir, { mode: 0o700 })
  const source = path.join(author, "timeout.json"), copy = path.join(delivery, "copied-timeout.json")
  await Bun.write(source, JSON.stringify({ kind: "provider_headers_timeout", tokens: 0, timeout_ms: 300000, attempt_sha256: "a".repeat(64) }))
  await copyFile(source, copy)
  const input = { ledgerDir, url: `http://127.0.0.1:${server.port}/v1`, apiKey: "fixture" }
  expect((await probeProviderRoute({ ...input, source, receipt: path.join(author, "probe.json") })).status).toBe("HEADERS_RECEIVED")
  await expect(probeProviderRoute({ ...input, source: copy, receipt: path.join(delivery, "probe.json") })).rejects.toThrow("PROBE_ALREADY_ATTEMPTED")
  expect(calls).toEqual(["HEAD"])
 } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
})

test("reformatted classification and another route preserve the same attempt allowance", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "evals-probe-identity-"))
 const calls: string[] = []
 const server = Bun.serve({ port: 0, fetch: request => { calls.push(new URL(request.url).pathname); return new Response(null, { status: 401 }) } })
 try {
  const ledgerDir = path.join(root, "ledger"), source = path.join(root, "timeout.json")
  await mkdir(ledgerDir, { mode: 0o700 })
  const failure = { kind: "provider_headers_timeout", tokens: 0, timeout_ms: 300000, attempt_sha256: "a".repeat(64) }
  await Bun.write(source, JSON.stringify(failure))
  const input = { ledgerDir, source, url: `http://127.0.0.1:${server.port}/v1`, apiKey: "fixture" }
  await probeProviderRoute({ ...input, receipt: path.join(root, "first.json") })
  await Bun.write(source, JSON.stringify(failure, null, 2))
  await expect(probeProviderRoute({ ...input, url: `http://127.0.0.1:${server.port}/another`, receipt: path.join(root, "second.json") })).rejects.toThrow("PROBE_ALREADY_ATTEMPTED")
  expect(calls).toEqual(["/v1"])
  const reservation = path.join(ledgerDir, failure.attempt_sha256 + ".json")
  expect((await stat(reservation)).mode & 0o777).toBe(0o600)
  expect(await Bun.file(reservation).json()).toMatchObject({ status: "CONSUMED_BEFORE_DISPATCH", attempt_sha256: failure.attempt_sha256 })
  // Identical classification of a different original result is a different incident.
  await Bun.write(source, JSON.stringify({ ...failure, attempt_sha256: "b".repeat(64) }))
  expect((await probeProviderRoute({ ...input, receipt: path.join(root, "third.json") })).status).toBe("HEADERS_RECEIVED")
  expect(calls).toEqual(["/v1", "/v1"])
 } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
})

test("concurrent copies reserve one HEAD before dispatch", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "evals-probe-race-"))
 const calls: string[] = []
 const server = Bun.serve({ port: 0, fetch: request => { calls.push(request.method); return new Response(null, { status: 405 }) } })
 try {
  const ledgerDir = path.join(root, "ledger"), source = path.join(root, "timeout.json"), copy = path.join(root, "copy.json")
  await mkdir(ledgerDir, { mode: 0o700 })
  await Bun.write(source, JSON.stringify({ kind: "provider_headers_timeout", tokens: 0, timeout_ms: 300000, attempt_sha256: "a".repeat(64) }))
  await copyFile(source, copy)
  const input = { ledgerDir, url: `http://127.0.0.1:${server.port}`, apiKey: "fixture" }
  const attempts = await Promise.allSettled([
   probeProviderRoute({ ...input, source, receipt: path.join(root, "one.json") }),
   probeProviderRoute({ ...input, source: copy, receipt: path.join(root, "two.json") }),
  ])
  expect(attempts.filter(attempt => attempt.status === "fulfilled")).toHaveLength(1)
  const denied = attempts.find(attempt => attempt.status === "rejected")
  expect(denied?.status === "rejected" && denied.reason.message).toBe("PROBE_ALREADY_ATTEMPTED")
  expect(calls).toEqual(["HEAD"])
 } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
})

test("NO_HEADERS cannot reset the incident allowance", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "evals-probe-no-headers-"))
 try {
  const ledgerDir = path.join(root, "ledger"), source = path.join(root, "timeout.json"), copy = path.join(root, "copy.json")
  await mkdir(ledgerDir, { mode: 0o700 })
  await Bun.write(source, JSON.stringify({ kind: "provider_headers_timeout", tokens: 0, timeout_ms: 300000, attempt_sha256: "a".repeat(64) }))
  await copyFile(source, copy)
  const input = { ledgerDir, url: "http://127.0.0.1:1", apiKey: "fixture" }
  expect((await probeProviderRoute({ ...input, source, receipt: path.join(root, "one.json") })).status).toBe("NO_HEADERS")
  await expect(probeProviderRoute({ ...input, source: copy, receipt: path.join(root, "two.json") })).rejects.toThrow("PROBE_ALREADY_ATTEMPTED")
 } finally { await rm(root, { recursive: true, force: true }) }
})

test("receipt write failure before dispatch preserves the consumed allowance", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "evals-probe-receipt-refusal-"))
 const calls: string[] = []
 const server = Bun.serve({ port: 0, fetch: request => { calls.push(request.method); return new Response(null, { status: 405 }) } })
 try {
  const ledgerDir = path.join(root, "ledger"), source = path.join(root, "timeout.json"), receipt = path.join(root, "existing.json")
  await mkdir(ledgerDir, { mode: 0o700 })
  await Bun.write(source, JSON.stringify({ kind: "provider_headers_timeout", tokens: 0, timeout_ms: 300000, attempt_sha256: "a".repeat(64) }))
  await Bun.write(receipt, "original receipt")
  const input = { source, ledgerDir, url: `http://127.0.0.1:${server.port}`, apiKey: "fixture" }
  await expect(probeProviderRoute({ ...input, receipt })).rejects.toThrow("EEXIST")
  expect(await Bun.file(receipt).text()).toBe("original receipt")
  expect(await Bun.file(path.join(ledgerDir, "a".repeat(64) + ".json")).json()).toMatchObject({ status: "CONSUMED_BEFORE_DISPATCH" })
  const next = path.join(root, "new.json")
  await expect(probeProviderRoute({ ...input, receipt: next })).rejects.toThrow("PROBE_ALREADY_ATTEMPTED")
  expect(await Bun.file(next).exists()).toBe(false)
  expect(calls).toEqual([])
 } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
})

test("old or malformed attempt identities cannot authorize a probe", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "evals-probe-old-source-"))
 try {
  const source = path.join(root, "timeout.json"), receipt = path.join(root, "probe.json")
  for (const attempt_sha256 of [undefined, null, 1, "a", "A".repeat(64)]) {
   await Bun.write(source, JSON.stringify({ kind: "provider_headers_timeout", tokens: 0, timeout_ms: 300000, attempt_sha256 }))
   await expect(probeProviderRoute({ source, receipt, ledgerDir: root, url: "http://127.0.0.1:1", apiKey: "fixture" })).rejects.toThrow("PROBE_SOURCE_REFUSED")
   expect(await Bun.file(receipt).exists()).toBe(false)
  }
 } finally { await rm(root, { recursive: true, force: true }) }
})

test("a nonprivate or aliased ledger cannot authorize dispatch", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "evals-probe-ledger-"))
 try {
  const ledgerDir = path.join(root, "ledger"), alias = path.join(root, "alias"), source = path.join(root, "timeout.json"), receipt = path.join(root, "probe.json")
  await mkdir(ledgerDir, { mode: 0o700 })
  await Bun.write(source, JSON.stringify({ kind: "provider_headers_timeout", tokens: 0, timeout_ms: 300000, attempt_sha256: "a".repeat(64) }))
  const input = { source, receipt, url: "http://127.0.0.1:1", apiKey: "fixture" }
  await chmod(ledgerDir, 0o755)
  await expect(probeProviderRoute({ ...input, ledgerDir })).rejects.toThrow("PROBE_LEDGER_REFUSED")
  await chmod(ledgerDir, 0o700)
  await symlink(ledgerDir, alias)
  await expect(probeProviderRoute({ ...input, ledgerDir: alias })).rejects.toThrow("PROBE_LEDGER_REFUSED")
  expect(await Bun.file(receipt).exists()).toBe(false)
  expect(await Bun.file(path.join(ledgerDir, "a".repeat(64) + ".json")).exists()).toBe(false)
 } finally { await rm(root, { recursive: true, force: true }) }
})
