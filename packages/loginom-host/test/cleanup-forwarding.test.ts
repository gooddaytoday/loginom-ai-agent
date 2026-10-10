import {test,expect} from 'bun:test'
import {mkdtemp,mkdir,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {createLoginomHost}=await import(process.env.HOST_SOURCE??new URL('../src/host.ts',import.meta.url).href)
import {connectionStore} from '../src/connection/connection-store'
import {credentials} from '../src/connection/credentials'
for(const binding of [undefined,'/own/result.lgp'])test('host forwards exact existing cleanup binding '+binding,async()=>{
 const node=process.env.LOGINOM_AI_AGENT_TEST_NODE
 if(!node)throw Error('pinned Node required')
 const dir=await mkdtemp(join(tmpdir(),'cleanup-forward-')),resources=join(dir,'resources'),root=join(dir,'profile')
 await mkdir(join(resources,'runtime/src'),{recursive:true});await mkdir(join(resources,'bin'))
 await symlink(node,join(resources,'bin/node'))
 await Bun.write(join(resources,'resource-manifest.json'),JSON.stringify({endpoint:'http://fixture.invalid'}))
 await Bun.write(join(resources,'runtime/src/managed-entry.mjs'),`let input;process.on('message',m=>{if(m.operation==='start'){input=m.input;process.send({id:m.id,result:{protocol:1,generation:input.generation,chat:input.chat,ready:true}})}else if(m.operation==='inspect')process.send({id:m.id,result:{binding:input.acceptanceCleanupPackage??null}});else if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect())})`)
 const store=connectionStore(join(root,'connection'),credentials('linux'))
 await store.stage({generation:1,revision:1,url:'http://fixture.invalid',username:'own',apiKey:'fixture',password:''});await store.activate(1)
 const host=await createLoginomHost({root,resources,codec:credentials('linux'),environment:{},acceptanceCleanupPackage:binding})
 try{await host.settled();const runtime=await host.runtime(1,'own-chat');expect(await runtime.request('inspect')).toEqual({binding:binding??null})}
 finally{await host.close();await rm(dir,{recursive:true,force:true})}
})
