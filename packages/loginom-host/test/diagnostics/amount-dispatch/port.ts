import assert from 'node:assert/strict';
import {loginomHostPort as sourcePort} from '../../../src/host-port';
import {readFile}from'node:fs/promises';import * as crypto from'node:crypto';
let loginomHostPort=sourcePort;
if(process.argv[2]){const code=await readFile(process.argv[2],'utf8');const a=code.indexOf('// src/errors.ts'),b=code.indexOf('// src/host-port.ts',a),c=code.indexOf('\n// ',b+1);assert(a>=0&&b>a&&c>b);const body=code.slice(a,c),names=[...new Set(body.match(/\b(?:randomUUID|createHash)\d*(?=\()/g)??[])];loginomHostPort=Function(...names,body+';return loginomHostPort;')(...names.map(n=>(crypto as any)[n.replace(/\d+$/,'')]))}
const rows:any[]=[];
for(const mode of ['canonical','foreign-operation','foreign-deadline','prepare-reply-refused','capture-reply-refused','generation-drift','abort-at-capture','pending-no-repeat']){
 const controller=new AbortController(),deadline=Date.now()+60000,replies:any[]=[],leases:any[]=[];let listener:any,rtCalls=0,prepares=0,captures=0,closes=0,owner:any,release:any;
 const tuple={authorization:'a'.repeat(64),operation:'operation',request:'request'},startup={tuple,control:{signal:controller.signal,deadline},guard(){controller.signal.throwIfAborted();if(Date.now()>=deadline)throw Error('expired')},abortAcquired(v:any){controller.abort(v);return true},propagate(v:any){return v},rejectionOrigin:'guard'};
 const lease={generation:1,holdRecovery(){},release(){}};
 const runtime={request:async(method:string,input:any,timeout:any,control:any)=>{assert.equal(control,startup.control);if(method==='acceptance.prepare'){prepares++;if(mode==='prepare-reply-refused')return {preparationComplete:false};if(mode==='pending-no-repeat')await new Promise(r=>release=r);return {preparationComplete:true}}captures++;if(mode==='generation-drift')lease.generation++;if(mode==='abort-at-capture')controller.abort(false);return {cleanupComplete:mode!=='capture-reply-refused'}},close:async()=>{closes++}};
 const pending=new Set<string>();const service:any={amountStartupControl:()=>startup,assertAmountAcquire(){},recoveries:new Map(),acquire(id:string){owner=id.split(':')[0];leases.push(id);return lease},resetRestarts(){},bindCapture(){},assertCapture(o:string,r:string,c:string,l:any){assert.equal(o,owner);assert.equal(l,lease)},authorizeCapture(a:any,o:any,r:any,c:any,l:any){return a===tuple.authorization&&o===owner&&r==='run'&&l===lease},runtime:async()=>{rtCalls++;return runtime},journal:{pending:()=>[...pending],async begin(){pending.add('journal');return 'journal'},async settle(id:string,ok:boolean){pending.delete(id)}}};
 loginomHostPort({postMessage:x=>replies.push(x),on:(event,fn)=>{if(event==='message')listener=fn},start(){}},service);
 async function send(x:any){listener({data:x});for(let i=0;i<50&&!replies.some(y=>y.id===x.id);i++)await new Promise(r=>setImmediate(r));return replies.find(y=>y.id===x.id)}
 const packet=(id:string,method:string)=>({id,method,deadline,input:{run:'run',...tuple}});
 await send({id:'acquire',method:'acquire',deadline,input:{run:'run',session:'session',amountControl:tuple}});assert.equal(rtCalls,1);
 const prepare=packet('prepare','acceptance.prepare');if(mode==='foreign-operation')prepare.input.operation='foreign';if(mode==='foreign-deadline')prepare.deadline++;
 if(mode==='pending-no-repeat'){listener({data:prepare});await new Promise(r=>setImmediate(r));const again=await send(packet('again','acceptance.prepare'));assert(again.error||again.rejection);assert.equal(prepares,1);release();for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));}
 else await send(prepare);
 if(['foreign-operation','foreign-deadline'].includes(mode)){assert.equal(prepares,0);assert.equal(captures,0)}
 else if(mode==='prepare-reply-refused'){const refused=await send(packet('capture','acceptance.capture'));assert(refused.error||refused.rejection);assert.equal(captures,0)}
 else{const reply=await send(packet('capture','acceptance.capture'));assert.equal(captures,1);if(mode==='generation-drift'||mode==='abort-at-capture'){assert(reply.rejection);assert.equal(closes,0)}else assert.equal(closes,mode==='capture-reply-refused'?0:1);const again=await send(packet('repeat','acceptance.capture'));assert(again.error||again.rejection);assert.equal(captures,1)}
 assert.equal(rtCalls,1,'no replacement runtime');rows.push({mode,pass:true,rtCalls,prepares,captures,closes});
}
console.log(JSON.stringify({pass:rows.length,rows,limits:'Real HostPort algorithm and event/microtask sequencing; service/lease/journal/runtime/native replies are named doubles, not actual native completion or embedded factory proof.'}));
