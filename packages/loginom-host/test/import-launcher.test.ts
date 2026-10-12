import {test,expect} from 'bun:test'
import {mkdtemp,writeFile,readFile,rm,mkdir,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {launchNodeHost,launchCalculatorDiagnostic,launchAmountDiagnostic,launchImportDiagnostic}=await import(process.env.CAPTURE_CALLER_BUNDLE??new URL('../src/node-client.ts',import.meta.url).href)
for(const amount of [false])test('verified fixed launcher '+(amount?'Amount':'Import')+' forwards authority only on its private pipe; tampered resource refuses',async()=>{
 const product=await mkdtemp(join(tmpdir(),'capture-launcher-pipe-')),root=join(product,'resources/loginom')
 let host:any
 try{
  const node=process.env.LOGINOM_AI_AGENT_TEST_NODE;if(!node)throw Error('Pinned Node required')
  for(const p of ['bin','host','runtime/src/acceptance'])await mkdir(join(root,p),{recursive:true})
  await copyFile(node,join(root,'bin/node'))
  const entry=join(root,'host/node-host.mjs'),harness=join(root,'runtime/src/acceptance/'+(amount?'amount-import-type-v1':'import-before-configure-v1')+'.mjs')
  await writeFile(harness,'export const captureCalculator=()=>{};')
  const collector='runtime/src/acceptance/ui-scan-collector.mjs'
  if(amount)await writeFile(join(root,collector),'// labelled offline collector fixture')
  await writeFile(entry,`let grant;process.on('message',m=>{
   if(m.method==='start'){grant=m.input.acceptanceCapture;process.send({id:m.id,result:{ready:true,protocol:1,pid:process.pid}});}
   if(m.method==='acceptance.capture')process.send({id:m.id,result:{authorized:m.input.authorization===grant.authorization,packagePath:grant.packagePath}});
   if(m.method==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  });`)
  const files=[];for(const path of ['bin/node','runtime/src/acceptance/'+(amount?'amount-import-type-v1':'import-before-configure-v1')+'.mjs',...(amount?[collector]:[])])
   files.push({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')})
  await writeFile(join(root,'resource-manifest.json'),JSON.stringify({files}))
  await writeFile(join(product,'cli-manifest.json'),JSON.stringify({format:'loginom-cli-artifact-v1',files:[
    {path:'resources/loginom/host/node-host.mjs',sha256:createHash('sha256').update(await readFile(entry)).digest('hex')}]}))
  const input={node:join(root,'bin/node'),entry,root,resources:root,headless:true,environment:{},packagePath:'/user/draft.lgp',deadline:Date.now()+90000}
  const launch=launchImportDiagnostic
  host=await launch(input);expect(await host.capture('retained-run')).toEqual({authorized:true,packagePath:input.packagePath})
  await host.close();host=undefined
  await writeFile(harness,'tampered');await expect(launch(input)).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 }finally{await host?.close();await rm(product,{recursive:true,force:true})}
},15000)
test('ordinary launcher refuses capture claims before any fork',async()=>{
 await expect(launchNodeHost({node:'/missing',entry:'/missing',root:'/missing',resources:'/missing',headless:true,
   acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/user/draft.lgp',deadline:Date.now()+90000}})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
})
test('fixed diagnostic launcher refuses missing reviewed harness before host admission',async()=>{
 const product=await mkdtemp(join(tmpdir(),'capture-launcher-')),root=join(product,'resources/loginom')
 try{
  await mkdir(root,{recursive:true})
  await writeFile(join(root,'resource-manifest.json'),JSON.stringify({files:[]}))
  await writeFile(join(product,'cli-manifest.json'),JSON.stringify({format:'loginom-cli-artifact-v1',files:[]}))
  await expect(launchImportDiagnostic({node:'/missing',entry:'/missing',root,resources:root,headless:true,
    packagePath:'/user/draft.lgp',deadline:Date.now()+90000})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 }finally{await rm(product,{recursive:true,force:true})}
})
for(const path of ['/foreign/../draft.lgp','/user/nested/draft.lgp','relative.lgp','/user/draft.js','/user/'+ 'a'.repeat(1024)+'.lgp'])
 test('diagnostic launcher rejects a noncanonical personal destination '+path,async()=>{
  await expect(launchImportDiagnostic({node:'/missing',entry:'/missing',root:'/missing',resources:'/missing',headless:true,
    packagePath:path,deadline:Date.now()+90000})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 })

for(const deadline of [undefined,null,false,0,'1',Date.now()-1,Date.now()+900000])test('Import launcher refuses unavailable/expired upstream deadline '+String(deadline),async()=>{
 await expect(launchImportDiagnostic({node:'/missing',entry:'/missing',root:'/missing',resources:'/missing',headless:true,packagePath:'/user/draft.lgp',deadline})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
})
