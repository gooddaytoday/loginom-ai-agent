import assert from 'node:assert/strict';import {privateAmountTransport}from'../../../src/transport';
const rows:any[]=[];
for(const mode of ['abort-false','abort-undefined','equal-false-secondary','equal-undefined-secondary','Error-cause0','send-reject']){
 const c=new AbortController(),deadline=Date.now()+10000,posted:any[]=[];let listener:any,primary:any,secondary:any;
 const original=mode==='Error-cause0'?new Error('first',{cause:0}):mode.includes('undefined')?undefined:false;
 const receive=(value:any,origin:any,extra?:any)=>{if(!primary)primary={value,origin};else if(origin==='await')secondary={value};if(extra)secondary=extra;return primary.value};
 const port:any={start(){},on(e:any,fn:any){listener=fn},off(){},postMessage(packet:any){posted.push(packet);if(mode==='send-reject'&&packet.method==='acceptance.prepare')throw original;if(packet.method==='readonly.preReady.cancel'&&mode.startsWith('equal-'))throw original}};
 const client=privateAmountTransport(port,receive);let settled=false;
 const work=client.dispatch('acceptance.prepare',{run:'run',authorization:'a'.repeat(64),operation:'op',request:'req'},{signal:c.signal,deadline,operation:'op',request:'req'}).then(v=>{settled=true;return{v}},v=>{settled=true;return{error:{v}}});
 if(mode!=='send-reject'){
  c.abort(original);await new Promise(r=>setImmediate(r));assert.equal(settled,false);assert.equal(posted.length,2);assert.equal(posted[1].input.deadline,deadline);assert.equal(posted[1].input.requestId,posted[0].id);
  // AbortController(undefined) uses DOMException; use the actual original signal reason.
  assert.equal(primary.value,c.signal.reason);if(mode.startsWith('equal-'))assert.equal(secondary.value,original);
  listener({data:{id:posted[0].id,rejection:{kind:'value',value:false,is_undefined:false},rejectionOrigin:'guard'}});
 }
 const result:any=await work;assert.equal(result.error.v,mode==='send-reject'?original:c.signal.reason);client.close();rows.push({mode,pass:true});
}
console.log(JSON.stringify({pass:rows.length,rows,limits:'Production private transport with original AbortController; peer IPC post/reply is a named double. No native authority.'}));
