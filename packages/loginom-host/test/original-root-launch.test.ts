import {test,expect} from 'bun:test'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {launchNodeHost} from '../src/node-client'
import {mintOriginalRunControl,retainOriginalRunOrigin} from '../src/original-run-control'
import {originalRootPort} from '../src/original-root-port'
import {connect,acquire,disconnect} from '../src/adapter'
test('fixed real Node launcher retains minted original root origin before startup then SDK owner; one root/one child',async()=>{
 const node=process.env.LOGINOM_AI_AGENT_TEST_NODE;if(!node)throw Error('Set pinned Node')
 const directory=await mkdtemp(join(tmpdir(),'root-origin-')),entry=join(directory,'fixture.mjs')
 await writeFile(entry,`process.on('message',m=>{if(m.method==='start')process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});else if(m.method==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());else process.send({id:m.id,result:m.method==='acquire'?{generation:1}:[]})})`)
 const input={node,entry,root:directory,resources:directory,headless:true,environment:{}},controller=new AbortController(),control=mintOriginalRunControl(controller.signal,Date.now()+7200_000),origin=retainOriginalRunOrigin(control).origin
 let host:any
 try{
  host=await launchNodeHost(input,control);const b=originalRootPort(host.port)!
  expect(b.facts.origin).toBe(origin);expect(b.facts.signal).toBe(controller.signal);expect(b.facts.deadline).toBe(control.deadline);expect(b.facts.child.pid).toBe(b.facts.pid);expect(b.parentOriginQualified).toBe(true);expect(b.nativeAuthority).toBe(false)
  const owner={deferRelease:true,leases:new Set<any>()};connect(host.port,owner,control);const lease=await acquire('original-chat');expect(owner.leases.has(lease)).toBe(true)
  await expect(launchNodeHost(input,control)).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');expect(host.alive).toBe(true)
 }finally{disconnect();await host?.close();await rm(directory,{recursive:true,force:true})}
})
for(const kind of ['copy','flag'])test('real fixed launcher rejects '+kind+' before child creation',async()=>{const node=process.env.LOGINOM_AI_AGENT_TEST_NODE;if(!node)throw Error('Set pinned Node');const controller=new AbortController(),control=mintOriginalRunControl(controller.signal,Date.now()+7200_000),input={node,entry:'/missing-should-not-run.mjs',root:'/missing',resources:'/missing',headless:true,environment:{}};await expect(launchNodeHost(kind==='flag'?{...input,rootOrigin:{label:'original'}} as any:input,kind==='copy'?{...control}:control)).rejects.toThrow(kind==='copy'?'LOGINOM_ORIGINAL_RUN_UNAVAILABLE':'LOGINOM_HANDSHAKE_INVALID')})
