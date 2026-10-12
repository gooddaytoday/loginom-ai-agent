import {test,expect} from "bun:test"
import {mkdtemp,writeFile,rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
const {supervise}=await import(process.env.PREREADY_SUPERVISOR??new URL("../../../../loginom-host/src/supervisor.ts",import.meta.url).href)
// Real supervise + Node child IPC; child runtime/read/native are labelled doubles.
const code=`process.on('message',m=>{
 if(m.operation==='start')process.send({id:m.id,result:{ready:true,protocol:1,generation:m.input.generation,chat:m.input.chat}});
 else if(m.operation==='readonly.preReady'){
  const deadline=m.input.deadline;
  if(deadline===globalThis.savedDeadline)throw Error('replayed');globalThis.savedDeadline=deadline;
  globalThis.pending=m.id;
  if(globalThis.wait) return;
  process.send({id:m.id,result:globalThis.failure?{readonlyPreReady:false,rejection:globalThis.failure}:{readonlyPreReady:true,result:{deadline,readOnly:true}}});
 }
 else if(m.operation==='fixture') {globalThis.wait=m.input.wait;globalThis.failure=m.input.failure;process.send({id:m.id,result:true})}
 else if(m.operation==='readonly.preReady.cancel') {globalThis.cancel={requestId:m.input.requestId,matched:m.input.requestId===globalThis.pending,rejection:m.input.rejection}}
 else if(m.operation==='inspect')process.send({id:m.id,result:globalThis.cancel});
 else if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.exit(0));
});`
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'pre-ready-ipc-'));const entry=join(dir,'entry.mjs');await writeFile(entry,code);const runtime=await supervise({node:process.env.PREREADY_NODE??process.execPath,entry,resources:dir,stateDir:dir,generation:7,chat:'original',endpoint:'https://fixture.invalid',connection:{apiKey:'double',password:'double',username:'double',url:'https://fixture.invalid'}});return {runtime,async close(){await runtime.close();await rm(dir,{recursive:true,force:true})}}}
test('private caller exact upstream deadline, no refreshed bound',async()=>{const f=await fixture();try{const controller=new AbortController(),deadline=Date.now()+900;expect(await f.runtime.readPreReady({signal:controller.signal,deadline})).toEqual({deadline,readOnly:true})}finally{await f.close()}})
test('already aborted raw original zero never dispatched',async()=>{const f=await fixture();try{const c=new AbortController();c.abort(0);let value:unknown='missing';try{await f.runtime.readPreReady({signal:c.signal,deadline:Date.now()+900})}catch(e){value=e}expect(value).toBe(0);expect(await f.runtime.request('inspect')).toBeUndefined()}finally{await f.close()}})
for(const mode of ['abort','deadline'])test('original '+mode+' relays exact pending request cancellation',async()=>{const f=await fixture();try{await f.runtime.request('fixture',{wait:true});const c=new AbortController();const promise=f.runtime.readPreReady({signal:c.signal,deadline:Date.now()+(mode==='abort'?900:25)});if(mode==='abort')setTimeout(()=>c.abort(false),15);let value:unknown;try{await promise}catch(e){value=e}if(mode==='abort')expect(value).toBe(false);else expect((value as Error).message).toBe('LOGINOM_PRE_READY_READ_EXPIRED');expect((await f.runtime.request('inspect') as any).matched).toBe(true)}finally{await f.close()}})
for(const value of [undefined,null,false,0,''])test('child raw falsy '+String(value)+' decoded without authority',async()=>{const f=await fixture();try{await f.runtime.request('fixture',{failure:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined}});let result:unknown='missing';try{await f.runtime.readPreReady({signal:new AbortController().signal,deadline:Date.now()+900})}catch(e){result=e}expect(result).toBe(value)}finally{await f.close()}})
test('child original Error and nested cause decoded',async()=>{const f=await fixture();try{await f.runtime.request('fixture',{failure:{kind:'Error',name:'TypeError',message:'original',cause:{kind:'value',value:0}}});try{await f.runtime.readPreReady({signal:new AbortController().signal,deadline:Date.now()+900});throw Error('missing rejection')}catch(e){expect((e as Error).name).toBe('TypeError');expect((e as Error).message).toBe('original');expect((e as Error).cause).toBe(0)}}finally{await f.close()}})
