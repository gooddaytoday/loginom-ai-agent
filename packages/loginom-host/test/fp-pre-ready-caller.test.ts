import {test,expect} from 'bun:test'
import {EventEmitter} from 'node:events'
import {readFile,writeFile,mkdtemp,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {privateFPTransport} from '../src/transport'
import {loginomHostPort} from '../src/host-port'
import {supervise} from '../src/supervisor'
// SOURCE composition; original managed handle / qualifier / whole bridge.
// Real Node child IPC + FS; auth/Page/SDK/native/host configuration are labelled doubles.
async function fixture(mode='canonical') {
 const dir=await mkdtemp(join(tmpdir(),'fp-controlled-caller-')),root=resolve('../loginom-runtime');
 let template=await readFile(join(root,'test/diagnostics/preready-receiving/reviewer-concurrency-child.mjs'),'utf8');
 const pageStart=template.indexOf('const page='),pageEnd=template.indexOf('\nconst context=',pageStart);
 template=template.slice(0,pageStart)+`const avatar={getAttribute:()=> 'MF;cntMain;tlbMainToolbar;btnAvatar',matches:()=>false,getBoundingClientRect:()=>({width:10,height:10}),hasAttribute:()=>false};
const realm=vm.createContext({URL,Date,location:{origin:'https://fixture.invalid'},bg:{app:{Version:'7.4.2'}},getComputedStyle:()=>({visibility:'visible',opacity:'1'}),document:{documentElement:{},createTreeWalker:()=>{let i=0;return {nextNode:()=>i++===0?avatar:null}}}});
const page={isClosed:()=>false,url:()=> 'https://fixture.invalid/app/',evaluate:async(fn,o)=>fn.toString().includes('__loginomDockReadinessV1')?{documentId:o.documentId,account:o.account,loginomBuild:'7.4.2'}:vm.runInContext('('+fn.toString()+')',realm)(o)};`+template.slice(pageEnd);
 template=template.replace("return {content:[", "if(mode==='metadata')state.session.metadata={...state.session.metadata};if(mode==='page')state.startupOwner.page={...page};if(mode==='false')throw false;if(mode==='error')throw new Error('primary',{cause:0});return {content:[");
 template=template.replace('hasUnsettledWork:()=>false','hasUnsettledWork:()=>mode===\'unsettled\'');
 const entry=join(dir,'child.mjs');await writeFile(entry,template.replace('const root=ROOT;','const root='+JSON.stringify(root)+';'));await symlink(join(root,'client/node_modules'),join(dir,'node_modules'));
 const chat=createHash('sha256').update('fixture-session').digest('hex');
 const runtime=await supervise({node:process.env.LOGINOM_AI_AGENT_TEST_NODE!,entry,resources:dir,stateDir:dir,generation:7,chat,endpoint:'https://fixture.invalid/mcp',connection:{apiKey:'double',password:'double',username:'worker',url:'https://fixture.invalid/app/'}});
 if(mode!=='canonical')await runtime.request('fixture.mode',mode)
 const inbound=new EventEmitter(),outbound=new EventEmitter();let grant:any,retained=Promise.resolve(runtime),released=0,holds=0;
 const lease={generation:7,release(){released++},holdRecovery(){holds++}};
 const service:any={recoveries:new Map(),journal:{pending:()=>[]},acquire:()=>lease,async retireRuntime(){},resetRestarts(){},authorizeCapture:(v:unknown)=>v==='fixture-private-grant',captureHarness:()=>grant?.harness,captureBinding:()=>grant,
  bindCapture(owner:string,run:string,chat:string){grant={owner,run,chat,generation:7,harness:'field-parameters-preservation-v1',lease:owner+':'+run,account:'worker',packagePath:'/worker/fixture.lgp',admission:'labelled-grant',expires:Date.now()+10000}},async runtime(){return runtime},retainedRuntime:()=>retained};
 const port=loginomHostPort({on:(e:any,fn:any)=>inbound.on(e,fn),postMessage:v=>outbound.emit('message',{data:v}),start(){}},service);
 const client=privateFPTransport({on:(e,fn)=>outbound.on(e,fn),off:(e,fn)=>outbound.off(e,fn),postMessage:v=>inbound.emit('message',{data:v}),start(){}});
 await client.request('acquire',{run:'fixture-run',session:'fixture-session'});
 return {client,port,runtime,dir,input:{run:'fixture-run',authorization:'fixture-private-grant'},replace(){retained=Promise.resolve(runtime)},foreign(){grant={...grant,owner:'foreign'}},pending(){service.journal.pending=()=>['original-pending']},async finish(){const facts=await runtime.request('fixture.exit');expect(await runtime.exited).toEqual({code:0,signal:null});client.close();await writeFile(join(dir,'receipt.json'),JSON.stringify({mode,facts,released,holds}));return {facts,released,holds}}}
}
async function refusal(p:()=>Promise<unknown>){try{await p();return false}catch{return true}}
test('fixed SOURCE caller reaches qualified same-Page read; cannot admit/capture/release/close afterwards',async()=>{const f=await fixture();try{const r:any=await f.client.readPreReady(f.input,{signal:new AbortController().signal,deadline:Date.now()+3000});expect(r.kind).toBe('PRE_READY_CLOSED_READ');expect(r.ready).toBe(false);expect(r.cleanupComplete).toBe(false);for(const method of ['admit','acceptance.capture','release'])expect(await refusal(()=>f.client.request(method,{...f.input}))).toBe(true);expect(await refusal(()=>f.port.close())).toBe(true)}finally{const r:any=await f.finish();expect(r.released).toBe(0);expect(r.facts.dispatches).toBe(1)}})
for(const mode of ['abort','deadline'])test('SOURCE caller original '+mode+' cancels exact retained read, no replay or release',async()=>{const f=await fixture(mode),c=new AbortController();try{const p=f.client.readPreReady(f.input,{signal:c.signal,deadline:Date.now()+(mode==='deadline'?50:3000)});if(mode==='abort')setTimeout(()=>c.abort(false),30);expect(await refusal(()=>p)).toBe(true);expect(await refusal(()=>f.client.readPreReady(f.input,{signal:new AbortController().signal,deadline:Date.now()+3000}))).toBe(true);expect(await refusal(()=>f.client.request('release',{run:'fixture-run'}))).toBe(true)}finally{const r:any=await f.finish();expect(r.released).toBe(0);expect(r.facts.dispatches).toBe(1)}})
for(const mode of ['foreign','pending','replaced'])test('SOURCE '+mode+' owner/runtime/pending refuses before publication',async()=>{const f=await fixture();try{if(mode==='foreign')f.foreign();if(mode==='pending')f.pending();const p=f.client.readPreReady(f.input,{signal:new AbortController().signal,deadline:Date.now()+3000});if(mode==='replaced')f.replace();expect(await refusal(()=>p)).toBe(true)}finally{const r:any=await f.finish();expect(r.released).toBe(0);expect(r.facts.dispatches).toBe(0)}})

for(const mode of ['metadata','page','false','error','unsettled'])test('SOURCE native/resource labelled '+mode+' refusal survives read without replay',async()=>{const f=await fixture(mode);try{expect(await refusal(()=>f.client.readPreReady(f.input,{signal:new AbortController().signal,deadline:Date.now()+3000}))).toBe(true);expect(await refusal(()=>f.client.request('acceptance.capture',f.input))).toBe(true)}finally{const r:any=await f.finish();expect(r.released).toBe(0);expect(r.facts.dispatches).toBe(mode==='unsettled'?0:1)}})
