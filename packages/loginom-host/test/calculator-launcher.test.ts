import {test,expect} from 'bun:test'
import {mkdtemp,writeFile,readFile,rm,mkdir,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {launchNodeHost,launchCalculatorDiagnostic}=await import(process.env.CAPTURE_CALLER_BUNDLE??new URL('../src/node-client.ts',import.meta.url).href)
test('verified fixed launcher forwards authority only on its private pipe; tampered resource refuses',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capture-launcher-pipe-'))
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
  const files=[];for(const path of ['bin/node','host/node-host.mjs','runtime/src/acceptance/calculator-grouped-before-done-v1.mjs'])
   files.push({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')})
  await writeFile(join(root,'resource-manifest.json'),JSON.stringify({files}))
  const input={node:join(root,'bin/node'),entry,root,resources:root,headless:true,environment:{},packagePath:'/user/draft.lgp'}
  host=await launchCalculatorDiagnostic(input);expect(await host.capture('retained-run')).toEqual({authorized:true,packagePath:input.packagePath})
  await host.close();host=undefined
  await writeFile(harness,'tampered');await expect(launchCalculatorDiagnostic(input)).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 }finally{await host?.close();await rm(root,{recursive:true,force:true})}
},15000)
test('ordinary launcher refuses capture claims before any fork',async()=>{
 await expect(launchNodeHost({node:'/missing',entry:'/missing',root:'/missing',resources:'/missing',headless:true,
   acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/user/draft.lgp'}})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
})
test('fixed diagnostic launcher refuses missing reviewed harness before host admission',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capture-launcher-'))
 try{
  await writeFile(join(root,'resource-manifest.json'),JSON.stringify({files:[]}))
  await expect(launchCalculatorDiagnostic({node:'/missing',entry:'/missing',root,resources:root,headless:true,
    packagePath:'/user/draft.lgp'})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 }finally{await rm(root,{recursive:true,force:true})}
})
for(const path of ['/foreign/../draft.lgp','/user/nested/draft.lgp','relative.lgp','/user/draft.js'])
 test('diagnostic launcher rejects a noncanonical personal destination '+path,async()=>{
  await expect(launchCalculatorDiagnostic({node:'/missing',entry:'/missing',root:'/missing',resources:'/missing',headless:true,
    packagePath:path})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 })
