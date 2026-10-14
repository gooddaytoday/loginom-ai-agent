import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import assert from 'node:assert/strict';
const [root,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
const host=await readFile(resolve(root,'packages/loginom-host/src/node-entry.ts'),'utf8');
const fragment=host.slice(host.indexOf('function stop() {'),host.indexOf('\nfunction reply(',host.indexOf('function stop() {')));
const code=new Bun.Transpiler({loader:'ts'}).transformSync('function bind(){'+fragment+'return stop;}');
const make=Function('state','recordClose','operations','events','closeRejection',code+'return bind();');
const box=(v:any):any=>v instanceof Error?{kind:'Error',message:v.message,...('cause'in v?{cause:box(v.cause)}:{})}:{kind:'value',is_undefined:v===undefined,value:v===undefined?null:v};
const rows=[];
for(const mode of ['canonical','startup-error','startup-false','cleanup-refused']){
 const first=mode==='startup-error'?Error('original',{cause:0}):false;const records:any[]=[],calls:string[]=[];
 const startup=mode==='canonical'?Promise.resolve():Promise.reject(first);startup.catch(()=>{});
 const state:any={starting:startup,host:{interruptAll:async()=>calls.push('interrupt'),close:async()=>{calls.push('original-close');if(mode==='cleanup-refused')throw Error('OWN_CLEANUP_BLOCKED',{cause:first})}},port:{close:async()=>calls.push('port-close')}};
 const stop=make(state,async(stage:string,detail:any)=>records.push({stage,...detail}),new Set(),{emit:()=>calls.push('closed')},box);
 let failure;try{await stop()}catch(e){failure=e}
 assert.equal(calls.filter(x=>x==='original-close').length,1);
 if(mode==='cleanup-refused'){assert(failure);assert.equal(state.closed,undefined);assert(!calls.includes('port-close'));assert(!records.some(x=>x.stage==='outer_acknowledgement'))}
 else{assert.equal(state.closed,true);assert(calls.includes('port-close'));await stop();assert.equal(calls.filter(x=>x==='original-close').length,1)}
 if(mode!=='canonical')assert.deepEqual(records.find(x=>x.stage==='startup_refusal').rejection,box(first));
 rows.push({mode,pass:true});
}
const a=host.indexOf('    if (!state.host) throw new Error("LOGINOM_HOST_NOT_READY")',host.indexOf('async function dispatch'));
const b=host.indexOf('    if (!message.method.startsWith',a);assert(a>=0&&b>a);
const route=Object.getPrototypeOf(async function(){}).constructor('state','message','stop','reply',host.slice(a,b));let physical=0;
await route({host:{},amountStartup:{accepted:false}},{method:'close',id:'own'},()=>{physical++;return Promise.resolve()},()=>{});assert.equal(physical,1);
await assert.rejects(route({host:{},amountStartup:{accepted:false}},{method:'acceptance.prepare'},()=>{},()=>{}),/NOT_READY/);rows.push({mode:'close-only-unaccepted-host-route',pass:true});
const managed=await readFile(resolve(root,'packages/loginom-runtime/src/managed-entry.mjs'),'utf8');const c=managed.indexOf('    if (message.operation === "close") {'),d=managed.indexOf('    if (state.closing)',c);assert(c>=0&&d>c);
const child=Object.getPrototypeOf(async function(){}).constructor('state','message','close','send',managed.slice(c,d));let closed=0,ack=0;
await child({controlledStartup:{accepted:false}},{operation:'close',id:'own'},async()=>{closed++},()=>{ack++});assert.equal(closed,1);assert.equal(ack,1);
await assert.rejects(child({controlledStartup:{accepted:false}},{operation:'acceptance.prepare'},async()=>{},()=>{}),/NOT_READY/);rows.push({mode:'close-only-unaccepted-managed-route',pass:true});
await writeFile(join(out,'results.json'),JSON.stringify({pass:rows.length,rows,limits:'Literal source stop/admission branches; host/port/owner cleanup are named doubles. No native logout/ACK claim.'},null,2)+'\n');console.log(rows.length);
