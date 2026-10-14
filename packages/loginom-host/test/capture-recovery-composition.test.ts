import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

// Host, connection store/service, leases, journal, port and supervisor are real.
// The child managed runtime is an explicitly scripted private-IPC fixture.
// No Loginom, Page, Calculator harness or model runs in this test.
if (process.env.REVIEW_HOST_BUNDLE) process.send = (() => true) as typeof process.send
const { createLoginomHost, connectionStore, loginomHostPort } = await import(
  process.env.REVIEW_HOST_BUNDLE ?? new URL('../src/host.ts', import.meta.url).href
)
const portFunction = loginomHostPort ?? (await import('../src/host-port')).loginomHostPort
const storeFunction = connectionStore ?? (await import('../src/connection/connection-store')).connectionStore

for (const harness of ['calculator-grouped-before-done-v1','amount-import-type-v1'] as const) for (const scenario of ['success', 'strict-success', 'strict-refusal', 'default-refusal', 'explicit-advisory-refusal']) test('actual host composition: '+harness+' '+scenario, async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-admission-host-'))
  const resources = join(root, 'fixture-resources'), profile = join(root, 'profile')
  let service: any
  try {
    await mkdir(join(resources, 'bin'), { recursive: true })
    await mkdir(join(resources, 'runtime/src'), { recursive: true })
    await copyFile(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(resources, 'bin/node'))
    await writeFile(join(resources, 'resource-manifest.json'), JSON.stringify({ endpoint:'http://fixture.invalid' }))
    await writeFile(join(resources, 'runtime/src/managed-entry.mjs'), `
      import {appendFile,readdir,readFile} from 'node:fs/promises';
      import {join} from 'node:path';
      let input;
      process.on('message',async m=>{
        if(m.operation==='start'){
          input=m.input;
          await appendFile(${JSON.stringify(join(root,'events.jsonl'))},JSON.stringify({event:'start',chat:input.chat,generation:input.generation,binding:input.acceptanceCapture})+'\\n');
          process.send({id:m.id,result:{protocol:1,ready:true,generation:input.generation,chat:input.chat}});
        }
        if(m.operation==='acceptance.capture'){
          const dir=${JSON.stringify(join(profile,'recovery'))};
          const names=(await readdir(dir)).filter(n=>n.endsWith('.json'));
          const entries=await Promise.all(names.map(async n=>JSON.parse(await readFile(join(dir,n),'utf8'))));
          await appendFile(${JSON.stringify(join(root,'events.jsonl'))},JSON.stringify({event:'capture-dispatched',entries})+'\\n');
          process.send({id:m.id,result:${scenario.endsWith('success') ? '{cleanupComplete:true}' : '{cleanupComplete:false,refused:true,rejected:0}'}});
        }
        if(m.operation==='call')process.send({id:m.id,result:{result:{sameBinding:input.acceptanceCapture},recoveryPending:false,activeWork:false}});
        if(m.operation==='close'){
          await appendFile(${JSON.stringify(join(root,'events.jsonl'))},JSON.stringify({event:'fixture-close',chat:input.chat})+'\\n');
          process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
        }
      });
    `)
    const codec = { encode:async (v:any)=>({apiKey:v.apiKey,password:v.password}),decode:async (v:any)=>v }
    const store = storeFunction(join(profile,'connection'), codec)
    await store.stage({generation:7,revision:1,url:'http://fixture.invalid',username:'user',apiKey:'test-only',password:'test-only'})
    await store.activate(7)
    service = await createLoginomHost({root:profile,resources,codec,environment:{},headless:true,
      ...(scenario.startsWith('strict-')?{strictRecovery:true}:scenario.startsWith('explicit-advisory')?{strictRecovery:false}:{}),
      acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/user/result.lgp',...(harness==='amount-import-type-v1'?{harness}:{})}})
    await service.settled()
    const listeners = new Map(), waiting = new Map<string,(v:any)=>void>()
    const port = portFunction({on:(name:string,fn:any)=>listeners.set(name,fn),start(){},postMessage:(v:any)=>waiting.get(v.id)?.(v)}, service)
    let sequence = 0
    const send = (method:string,input:any) => new Promise<any>(resolve=>{
      const id = String(++sequence);waiting.set(id,resolve);listeners.get('message')({data:{id,method,input}})
    })
    expect((await send('acquire',{run:'original-run',session:'original-chat'})).result.generation).toBe(7)
    const captured = await send('acceptance.capture',{run:'original-run',authorization:'a'.repeat(64)})
    const starts = (await readFile(join(root,'events.jsonl'),'utf8')).trim().split('\n').map((line:string)=>JSON.parse(line))
    const capturedStart = starts.find((e:any)=>e.binding)
    const binding = capturedStart.binding
    expect(binding.generation).toBe(7)
    expect(binding.run).toBe('original-run')
    expect(binding.chat).toBe(createHash('sha256').update('original-chat').digest('hex'))
    expect(binding.harness).toBe(harness)
    expect(binding.lease).toBe(binding.owner+':original-run')
    const admissionAtDispatch=starts.find((e:any)=>e.event==='capture-dispatched').entries
    expect(admissionAtDispatch).toHaveLength(1)
    expect(admissionAtDispatch[0].generation).toBe(binding.generation)
    expect(admissionAtDispatch[0].chat).toBe(binding.chat)
    const before = await readdir(join(profile,'recovery'))
    const admissionBytes=before.filter((n:string)=>n.endsWith('.json')).length?await readFile(join(profile,'recovery',before.find((n:string)=>n.endsWith('.json'))!),'utf8'):undefined
    if (scenario.endsWith('success')) {
      expect(captured.result.cleanupComplete).toBe(true)
      expect(before.filter((n:string)=>n.endsWith('.json'))).toHaveLength(0)
      expect((await send('release',{run:'original-run'})).result).toBe(true)
      await port.close()
    } else {
      expect(captured.result.rejected).toBe(0)
      expect((await send('release',{run:'original-run'})).error).toBe('LOGINOM_RECOVERY_REQUIRED')
      await expect(port.close()).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED')
      const diag = await send('call',{run:'original-run',name:'dock_diagnostics',args:{checkConnections:false}})
      expect(diag.result.sameBinding).toEqual(binding)
      const after = await readdir(join(profile,'recovery'))
      const evidence = {scenario,binding,admission_at_dispatch:admissionAtDispatch,captured:captured.result,journal_before_diagnosis:before,journal_after_diagnosis:after,
        pending:service.journal.pending(),same_owner_diagnosis:diag.result.sameBinding,live:false}
      await writeFile(join(process.env.REVIEW_RESULTS_DIR!, harness+'-'+scenario+'.json'),JSON.stringify(evidence,null,2)+'\n')
      expect(after).toEqual(before)
      expect(before.filter((n:string)=>n.endsWith('.json'))).toHaveLength(1)
      expect(await readFile(join(profile,'recovery',before.find((n:string)=>n.endsWith('.json'))!),'utf8')).toBe(admissionBytes!)
      // An uncertain capture must keep its durable admission, including when
      // the private launcher did not explicitly select strictRecovery.
      expect(before.filter((n:string)=>n.endsWith('.json'))).toHaveLength(1)
      expect(service.journal.pending()).toHaveLength(1)
      // Re-open the same closed diagnostic profile through the real host/store;
      // no new connection, admission or native effect is created by this check.
      await service.close()
      service = await createLoginomHost({root:profile,resources,codec,environment:{},headless:true,
        strictRecovery:scenario.startsWith('strict-'),
        acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/user/result.lgp',...(harness==='amount-import-type-v1'?{harness}:{})}})
      await service.settled()
      expect(service.journal.pending()).toEqual([admissionAtDispatch[0].id])
      expect(await readFile(join(profile,'recovery',before.find((n:string)=>n.endsWith('.json'))!),'utf8')).toBe(admissionBytes!)
    }
  } finally {
    // These are our scripted IPC children, with no browser/native resources.
    await service?.close()
    await rm(root,{recursive:true,force:true})
  }
}, 15000)

for(const strictRecovery of [false,true])test('ordinary host journal keeps its original policy: '+strictRecovery,async()=>{
 const root=await mkdtemp(join(tmpdir(),'ordinary-recovery-policy-'))
 const codec={encode:async(v:any)=>v,decode:async(v:any)=>v}
 let service:any
 try{
  service=await createLoginomHost({root,resources:root,codec,environment:{},strictRecovery})
  await service.settled()
  const id=await service.journal.begin('a'.repeat(64),7)
  await service.journal.settle(id,false)
  expect(service.journal.pending()).toEqual(strictRecovery?[id]:[])
  expect((await readdir(join(root,'recovery'))).filter(n=>n.endsWith('.json'))).toEqual(strictRecovery?[id+'.json']:[])
 }finally{await service?.close();await rm(root,{recursive:true,force:true})}
})
