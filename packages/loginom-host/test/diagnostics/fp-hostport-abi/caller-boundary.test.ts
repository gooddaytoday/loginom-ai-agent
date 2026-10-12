import {test,expect} from 'bun:test';
import {fork} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {transport} from '../../../src/transport';
let sequence=0;
async function fixture(){
 const dir=resolve(process.env.FPABI_RECEIPTS!,'case-'+(++sequence));await mkdir(dir,{recursive:true});const ledger=join(dir,'ledger.ndjson');
 const child=fork(resolve(process.env.FPABI_CHILD!),[],{execPath:process.env.FPABI_NODE,execArgv:[],stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,FPABI_LEDGER:ledger}});
 const events=new EventEmitter(),messages:any[]=[];child.on('message',m=>events.emit('message',{data:m}));
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const client=transport({postMessage(v){messages.push(v);child.send(v as object)},on:(e,fn)=>events.on(e,fn),start(){}});
 async function snapshot(){const id='snapshot-'+sequence;return await new Promise<any>(resolve=>{const fn=({data}:any)=>{if(data.id===id){events.off('message',fn);resolve(data.result)}};events.on('message',fn);child.send({id,fixture:'snapshot'})})}
 async function close(){child.send({fixture:'exit'});expect(await exit).toEqual({code:0,signal:null});client.close()}
 await client.request('acquire',{run:'original-run',session:'labelled-original-session'});
 return {client,messages,snapshot,close,ledger};
}
for(const method of ['readonly.preReady','readonly.preReady.cancel'])test('ordinary HostPort has no '+method+' ABI',async()=>{const f=await fixture();try{await expect(f.client.request(method,{run:'original-run',deadline:Date.now()+1000,authorization:'submitted-nonce'})).rejects.toThrow('LOGINOM_HOST_REQUEST_FAILED');expect(await f.snapshot()).toEqual({read:0,mutation:0,release:0,runtime:0})}finally{await f.close()}});
for(const extra of [{authorization:'submitted-nonce'},{authorization:'submitted-nonce',deadline:Date.now()+1000},{authorization:'submitted-nonce',ready:true,storageBinding:{}}])test('submitted capture fields are not authority '+Object.keys(extra),async()=>{const f=await fixture();try{await expect(f.client.request('acceptance.capture',{run:'original-run',...extra})).rejects.toThrow('LOGINOM_METHOD_INVALID');expect(await f.snapshot()).toEqual({read:0,mutation:0,release:0,runtime:0})}finally{await f.close()}});
test('ordinary request drops proposed control: aborted/expired does not reach internal readPreReady',async()=>{const f=await fixture();try{const c=new AbortController();c.abort(false);const deadline=Date.now()-1;const result=await (f.client.request as any)('call',{run:'original-run',name:'dock_workspace_observe',userMessage:'FP model input WITHOUT oracle',args:{}},1000,{signal:c.signal,deadline});expect(result).toEqual({kind:'labelled-read-only-double'});const sent=f.messages.find(x=>x.method==='call');expect(Object.keys(sent).sort()).toEqual(['id','input','method']);expect(sent.input.deadline).toBeUndefined();expect(sent.input.signal).toBeUndefined();const raw=await readFile(f.ledger,'utf8');expect(raw).toContain('dock_workspace_observe');expect(raw).not.toContain('readonly.preReady');expect(await f.snapshot()).toEqual({read:0,mutation:0,release:0,runtime:1})}finally{await f.close()}});
