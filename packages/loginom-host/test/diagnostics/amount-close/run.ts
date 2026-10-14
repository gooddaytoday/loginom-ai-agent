import assert from'node:assert/strict';import{loginomHostPort}from'../../../src/host-port';
const rows:any[]=[];
for(const mode of ['close','pending-callback','pending-journal','close-false','generation-drift']){
 let message:any,finish:any,calls=0,releases=0;const replies:any[]=[],deadline=Date.now()+120000;
 const lease={generation:1,holdRecovery(){},release(){releases++}},startup={tuple:{authorization:'a',operation:'op',request:'req'},control:{signal:new AbortController().signal,deadline},guard(){},propagate(v:any){return v}};
 const runtime={async close(){calls++;if(mode==='pending-callback')await new Promise(r=>finish=r);if(mode==='close-false')throw false;if(mode==='generation-drift')lease.generation++}};
 const service:any={recoveries:new Map(),amountStartupControl:()=>startup,assertAmountAcquire(){},acquire(){return lease},resetRestarts(){},bindCapture(){},runtime:async()=>runtime,assertCapture(){},journal:{pending:()=>mode==='pending-journal'?['owned-pending']:[],async settle(){}}};
 const port=loginomHostPort({on:(e,fn)=>{if(e==='message')message=fn},start(){},postMessage:r=>replies.push(r)},service);
 message({data:{id:'acquire',method:'acquire',deadline,input:{run:'run',session:'session',amountControl:{authorization:'a',operation:'op',request:'req'}}}});for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));assert(replies.some(r=>r.id==='acquire'));
 let error,present=false,settled=false;const work=port.close().then(()=>settled=true,v=>{present=true;error=v;settled=true});
 if(mode==='pending-callback'){await new Promise(r=>setImmediate(r));assert.equal(releases,0);assert.equal(settled,false);message({data:{id:'late',method:'acceptance.prepare',input:{run:'run'}}});await new Promise(r=>setImmediate(r));assert.equal(replies.find(r=>r.id==='late').error,'LOGINOM_HOST_CLOSED');finish();}
 await work;
 if(['close','pending-callback'].includes(mode)){assert.equal(present,false);assert.equal(releases,1);await port.close();assert.equal(calls,1)}else{assert(present);assert.equal(releases,0);if(mode==='close-false')assert.equal(error,false);if(mode==='pending-journal')assert.equal(calls,0)}
 rows.push({mode,pass:true,calls,releases});
}
console.log(JSON.stringify({pass:rows.length,rows,limits:'Real HostPort with supervised runtime/lease/service doubles; not native cleanup/release authority.'}));
