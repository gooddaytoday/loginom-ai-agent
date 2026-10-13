import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MessageChannel } from 'node:worker_threads'

process.send = (() => true) as typeof process.send
const api = await import(process.env.GENERATION_HOST_MODULE || '../src/host')
const { loginomHostPort } = process.env.GENERATION_HOST_MODULE
  ? api : await import('../src/host-port')
const { connectionStore } = process.env.GENERATION_HOST_MODULE
  ? api : await import('../src/connection/connection-store')

async function fixture(stage: string, primary?: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'generation73-composition-'))
  let host: any, port: any, tuple: any
  let channel: MessageChannel | undefined
  const runtimeGenerations: number[] = [], journalGenerations: number[] = []
  const counts = { request: 0, close: 0, begin: 0, trueSettle: 0, falseSettle: 0 }
  const originalGrant = { authorization: 'trusted', packagePath: '/own/original.lgp', harness: 'replacement-input0-readonly-v1' }
  const resources = join(root, 'resources')
  try {
    await mkdir(join(resources, 'bin'), { recursive: true })
    await mkdir(join(resources, 'runtime/src'), { recursive: true })
    await copyFile(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(resources, 'bin/node'))
    await writeFile(join(resources, 'runtime/src/managed-entry.mjs'), `process.on('message',m=>{if(m.operation==='start')process.send({id:m.id,result:{protocol:1,ready:true,generation:m.input.generation,chat:m.input.chat}});if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect())})`)
    await writeFile(join(resources, 'resource-manifest.json'), JSON.stringify({ endpoint: 'http://fixture.invalid' }))
    const codec = { encode: async (v: any) => ({ apiKey: v.apiKey, password: v.password }), decode: async (v: any) => v }
    const store = connectionStore(join(root, 'connection'), codec)
    await store.stage({ generation: 7, revision: 1, url: 'http://fixture.invalid', username: 'own', apiKey: 'fixture', password: 'fixture' })
    await store.activate(7)
    host = await api.createLoginomHost({ root, resources, codec, environment: {}, acceptanceCapture: originalGrant })
    await host.settled()
    const bind = host.bindCapture.bind(host)
    const service = { ...host,
      bindCapture(owner: string, run: string, chat: string, lease: any) {
        tuple = { owner, run, chat, lease }; bind(owner, run, chat, lease)
      },
      async runtime(generation: number) {
        runtimeGenerations.push(generation)
        if (stage === 'runtime') tuple.lease.generation = 8
        return {
          async request() {
            counts.request++
            if (stage === 'capture' || stage === 'primary') tuple.lease.generation = 8
            if (stage === 'primary') throw primary
            return { cleanupComplete: true }
          },
          async close() {
            counts.close++
            if (stage === 'close') tuple.lease.generation = 8
            if (stage === 'close-unknown') tuple.lease.generation = undefined
            if (stage === 'close-primary') { tuple.lease.generation = 8; throw primary }
            if (stage === 'real-stale') host.markRuntimeStale(tuple.chat)
            // Legitimate exit may mark currentness lost without changing generation.
            if (stage === 'legitimate-lost') service.authorizeCapture = () => false
          },
        }
      },
      journal: { ...host.journal,
        async begin(chat: string, generation: number) {
          counts.begin++; journalGenerations.push(generation)
          const id = await host.journal.begin(chat, generation)
          if (stage === 'journal') tuple.lease.generation = 8
          return id
        },
        async settle(id: string, certain: boolean) {
          certain ? counts.trueSettle++ : counts.falseSettle++
          await host.journal.settle(id, certain)
          if (certain && stage === 'settle') tuple.lease.generation = 8
        },
      },
    }
    const waiting = new Map(); let sequence = 0
    channel = new MessageChannel()
    channel.port2.on('message', (reply: any) => waiting.get(reply.id)?.(reply))
    port = loginomHostPort({ on: (key: string, fn: any) => channel!.port1.on(key, data => fn({ data })),
      start() { channel!.port1.start() }, postMessage: (reply: any) => channel!.port1.postMessage(reply) }, service)
    const send = (method: string, input: any) => new Promise<any>(resolve => {
      const id = String(++sequence); waiting.set(id, resolve)
      channel!.port2.postMessage({ id, method, input })
    })
    expect((await send('acquire', { run: 'original', session: 'original' })).result.generation).toBe(7)
    expect(host.authorizeCapture('trusted', tuple.owner, tuple.run, tuple.chat, tuple.lease)).toBe(true)
    // Exact Replacement selector; no donor Import constructor/algorithm transfer.
    if (stage === 'initial') tuple.lease.generation = 8
    if (stage === 'unknown') tuple.lease.generation = undefined
    if (stage === 'invalid') tuple.lease.generation = primary
    const reply = await send('acceptance.capture', { run: 'original', authorization: 'trusted' })
    return { host, tuple, send, reply, counts, runtimeGenerations, journalGenerations, async cleanup() {
      console.log('GENERATION_RESULT '+JSON.stringify({stage,reply,counts,runtimeGenerations,journalGenerations,pending:host.journal.pending(),lease_retained:host.recoveries.get(tuple.chat)===tuple.lease,native:false}));
      tuple.lease.generation = 7
      await port.close().catch(() => {})
      await host.close()
      channel!.port1.close(); channel!.port2.close()
      await rm(root, { recursive: true, force: true })
    } }
  } catch (error) {
    if (tuple) tuple.lease.generation = 7
    await port?.close().catch(() => {}); await host?.close()
    channel?.port1.close(); channel?.port2.close()
    await rm(root, { recursive: true, force: true }); throw error
  }
}


for (const value of [null, false, '7', 0, -1, 7.5, NaN, Infinity, Number.MAX_SAFE_INTEGER+1]) {
  test('independent invalid generation refuses before runtime/journal '+String(value), async()=>{
    const f=await fixture('invalid',value)
    try { expect(f.reply.error).toBeDefined(); expect(f.runtimeGenerations).toEqual([]); expect(f.journalGenerations).toEqual([]); expect(f.counts.request).toBe(0); expect(f.counts.close).toBe(0) } finally { await f.cleanup() }
  })
}
test('independent exact host stale transition after Close permits original-generation settlement', async()=>{
  const f=await fixture('real-stale')
  try { expect(f.host.authorizeCapture('trusted',f.tuple.owner,f.tuple.run,f.tuple.chat,f.tuple.lease)).toBe(false); expect(f.reply.error).toBeUndefined(); expect(f.reply.result.cleanupComplete).toBe(true); expect(f.counts.trueSettle).toBe(1); expect(f.host.journal.pending()).toEqual([]) } finally { await f.cleanup() }
})
test('independent post-close unknown retains original strict journal/owner without replay',async()=>{
 const f=await fixture('close-unknown')
 try { expect(f.reply.error).toBe('LOGINOM_RECOVERY_REQUIRED'); expect(f.counts).toEqual({request:1,close:1,begin:1,trueSettle:0,falseSettle:1}); expect(f.host.journal.pending().length).toBe(1); expect(f.host.recoveries.get(f.tuple.chat)).toBe(f.tuple.lease); expect((await f.send('release',{run:'original'})).error).toBe('LOGINOM_RECOVERY_REQUIRED'); expect((await f.send('acceptance.capture',{run:'original',authorization:'trusted'})).error).toBe('LOGINOM_RECOVERY_REQUIRED'); expect(f.counts.request).toBe(1); expect(f.counts.close).toBe(1) } finally { await f.cleanup() }
})
for(const value of [new Error('LOGINOM_STORE_READ_FAILED',{cause:0}),undefined,null,false,0,'']) {
 test('independent Close primary classification before generation refusal '+String(value),async()=>{
  const f=await fixture('close-primary',value)
  try { expect(f.reply.error).toBe(value instanceof Error?'LOGINOM_STORE_READ_FAILED':'LOGINOM_HOST_REQUEST_FAILED'); expect(f.counts.close).toBe(1); expect(f.counts.trueSettle).toBe(0); expect(f.host.journal.pending().length).toBe(1); expect(f.host.recoveries.get(f.tuple.chat)).toBe(f.tuple.lease) } finally { await f.cleanup() }
 })
}

for (const stage of ['matching', 'legitimate-lost', 'initial', 'unknown', 'runtime', 'journal', 'capture', 'close', 'settle']) {
  test('Replacement original generation composition ' + stage, async () => {
    const f = await fixture(stage)
    try {
      expect(f.runtimeGenerations.every(value => value === 7)).toBe(true)
      expect(f.journalGenerations.every(value => value === 7)).toBe(true)
      if (stage === 'matching' || stage === 'legitimate-lost') {
        expect(f.reply.error).toBeUndefined(); expect(f.reply.result.cleanupComplete).toBe(true)
        expect(f.counts).toEqual({ request: 1, close: 1, begin: 1, trueSettle: 1, falseSettle: 0 })
      } else {
        expect(f.reply.error).toBeDefined()
        if (stage === 'initial' || stage === 'unknown' || stage === 'runtime' || stage === 'journal') expect(f.counts.request).toBe(0)
        if (stage === 'close' || stage === 'settle') expect(f.counts.close).toBe(1)
        else expect(f.counts.close).toBe(0)
        if (stage !== 'settle') expect(f.counts.trueSettle).toBe(0)
      }
    } finally { await f.cleanup() }
  })
}
for (const primary of [new Error('LOGINOM_STORE_READ_FAILED', { cause: 0 }), undefined, null, false, 0, '']) {
  test('settled primary beats secondary generation guard ' + String(primary), async () => {
    const f = await fixture('primary', primary)
    try {
      expect(f.reply.error).toBe(primary instanceof Error ? 'LOGINOM_STORE_READ_FAILED' : 'LOGINOM_HOST_REQUEST_FAILED')
      expect(f.counts.request).toBe(1); expect(f.counts.close).toBe(0)
      expect(f.counts.falseSettle).toBe(1); expect(f.counts.trueSettle).toBe(0)
    } finally { await f.cleanup() }
  })
}
