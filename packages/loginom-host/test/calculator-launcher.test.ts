import {test,expect} from 'bun:test'
import {mkdtemp,writeFile,readFile,rm,mkdir,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {launchNodeHost,launchCalculatorDiagnostic}=await import(process.env.CAPTURE_CALLER_BUNDLE??new URL('../src/node-client.ts',import.meta.url).href)
test('verified fixed launcher forwards authority only on its private pipe; tampered resource refuses',async()=>{
 const product=await mkdtemp(join(tmpdir(),'capture-launcher-pipe-')),root=join(product,'resources/loginom')
 let host:any
 try{
  const node=process.env.LOGINOM_AI_AGENT_TEST_NODE;if(!node)throw Error('Pinned Node required')
  for(const p of ['bin','host','runtime/src/acceptance'])await mkdir(join(root,p),{recursive:true})
  await copyFile(node,join(root,'bin/node'))
  const entry=join(root,'host/node-host.mjs'),harness=join(root,'runtime/src/acceptance/calculator-grouped-before-done-v1.mjs')
  await writeFile(harness,'export const captureCalculator=()=>{};')
  await writeFile(entry,`let grant;process.on('message',m=>{
   if(m.method==='start'){grant=m.input.acceptanceCapture;process.send({id:m.id,result:{ready:true,protocol:1,pid:process.pid}});}
   if(m.method==='acceptance.capture')process.send({id:m.id,result:{authorized:m.input.authorization===grant.authorization,packagePath:grant.packagePath}});
   if(m.method==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  });`)
  const files=[];for(const path of ['bin/node','runtime/src/acceptance/calculator-grouped-before-done-v1.mjs'])
   files.push({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')})
  await writeFile(join(root,'resource-manifest.json'),JSON.stringify({files}))
  await writeFile(join(product,'cli-manifest.json'),JSON.stringify({format:'loginom-cli-artifact-v1',files:[
    {path:'resources/loginom/host/node-host.mjs',sha256:createHash('sha256').update(await readFile(entry)).digest('hex')}]}))
  const input={node:join(root,'bin/node'),entry,root,resources:root,headless:true,environment:{},packagePath:'/user/draft.lgp'}
  host=await launchCalculatorDiagnostic(input);expect(await host.capture('retained-run')).toEqual({authorized:true,packagePath:input.packagePath})
  await host.close();host=undefined
  await writeFile(harness,'tampered');await expect(launchCalculatorDiagnostic(input)).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 }finally{await host?.close();await rm(product,{recursive:true,force:true})}
},15000)
test('ordinary launcher refuses capture claims before any fork',async()=>{
 await expect(launchNodeHost({node:'/missing',entry:'/missing',root:'/missing',resources:'/missing',headless:true,
   acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/user/draft.lgp'}})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
})
test('fixed diagnostic launcher refuses missing reviewed harness before host admission',async()=>{
 const product=await mkdtemp(join(tmpdir(),'capture-launcher-')),root=join(product,'resources/loginom')
 try{
  await mkdir(root,{recursive:true})
  await writeFile(join(root,'resource-manifest.json'),JSON.stringify({files:[]}))
  await writeFile(join(product,'cli-manifest.json'),JSON.stringify({format:'loginom-cli-artifact-v1',files:[]}))
  await expect(launchCalculatorDiagnostic({node:'/missing',entry:'/missing',root,resources:root,headless:true,
    packagePath:'/user/draft.lgp'})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 }finally{await rm(product,{recursive:true,force:true})}
})
for(const path of ['/foreign/../draft.lgp','/user/nested/draft.lgp','relative.lgp','/user/draft.js','/user/'+ 'a'.repeat(1024)+'.lgp'])
 test('diagnostic launcher rejects a noncanonical personal destination '+path,async()=>{
  await expect(launchCalculatorDiagnostic({node:'/missing',entry:'/missing',root:'/missing',resources:'/missing',headless:true,
    packagePath:path})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 })

// Uses unmodified published product inventories and exact Node/host bytes.
// The sole added resource is a labelled offline fixed harness fixture; no saved
// connection is supplied, so this proves launch/close without native admission.
if(process.env.CAPTURE_PRODUCT) for(const scenario of ['exact','host-hash','duplicate-host','runtime-only-host','foreign-entry','node-hash','harness-hash'])
 test('actual receiving inventory: '+scenario,async()=>{
  const receiving=process.env.CAPTURE_PRODUCT!,product=await mkdtemp(join(tmpdir(),'capture-receiving-'))
  const root=join(product,'resources/loginom'),profile=join(product,'profile')
  let host:any
  try{
   for(const p of ['bin','host','runtime/src/acceptance'])await mkdir(join(root,p),{recursive:true})
   for(const p of ['bin/node','host/node-host.mjs'])await copyFile(join(receiving,'resources/loginom',p),join(root,p))
   const manifest=JSON.parse(await readFile(join(receiving,'resources/loginom/resource-manifest.json'),'utf8'))
   const cli=JSON.parse(await readFile(join(receiving,'cli-manifest.json'),'utf8'))
   const hostItem=cli.files.find((f:any)=>f.path==='resources/loginom/host/node-host.mjs')
   expect(hostItem).toBeDefined()
   expect(manifest.files.some((f:any)=>f.path==='host/node-host.mjs')).toBe(false)
   const harnessPath='runtime/src/acceptance/calculator-grouped-before-done-v1.mjs'
   const harness='export const captureCalculator=()=>{}; // offline fixture only\n'
   await writeFile(join(root,harnessPath),harness)
   manifest.files.push({path:harnessPath,sha256:createHash('sha256').update(harness).digest('hex')})
   if(scenario==='host-hash')hostItem.sha256='0'.repeat(64)
   if(scenario==='duplicate-host')cli.files.push({...hostItem})
   if(scenario==='runtime-only-host'){
    manifest.files.push({path:'host/node-host.mjs',sha256:hostItem.sha256})
    cli.files=cli.files.filter((f:any)=>f!==hostItem)
   }
   if(scenario==='node-hash')await writeFile(join(root,'bin/node'),'tampered')
   if(scenario==='harness-hash')await writeFile(join(root,harnessPath),'tampered')
   await writeFile(join(root,'resource-manifest.json'),JSON.stringify(manifest))
   await writeFile(join(product,'cli-manifest.json'),JSON.stringify(cli))
   let entry=join(root,'host/node-host.mjs')
   if(scenario==='foreign-entry'){entry=join(product,'foreign.mjs');await copyFile(join(root,'host/node-host.mjs'),entry)}
   const input={node:join(root,'bin/node'),entry,resources:root,root:profile,headless:true,environment:{},packagePath:'/user/result.lgp'}
   if(scenario==='exact'){
    host=await launchCalculatorDiagnostic(input);expect(host.alive).toBe(true)
    await host.close();host=undefined
   }else{
    await expect(launchCalculatorDiagnostic(input).then((value:any)=>{host=value;return value})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
    await expect(readFile(join(profile,'connection/connection.json'))).rejects.toThrow()
   }
  }finally{await host?.close();await rm(product,{recursive:true,force:true})}
 },15000)
