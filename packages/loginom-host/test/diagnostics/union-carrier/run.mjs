import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {writeFile} from 'node:fs/promises';
const [adapterPath,helperPath,output]=process.argv.slice(2);
const {connect,disconnect,acquire}=await import(adapterPath);
const {retainUnionInvocation,bindUnionInvocationProcessor}=await import(helperPath);
const {port1,port2}=new MessageChannel();let callCount=0;const pending=[];
port2.on('message',data=>{
 if(data.method==='acquire')port2.postMessage({id:data.id,result:{generation:39}});
 else if(data.method==='call'){callCount++;pending.push(data)}
 else port2.postMessage({id:data.id,result:true});
});
connect({postMessage:value=>port1.postMessage(value),on:(event,listener)=>port1.on(event,data=>listener({data})),start:()=>port1.start()});const owner=await acquire('same-session');
const controller=new AbortController(),request={operation_id:'op',target:{type:'transform.union_data'},budgets:{configure_ms:1,execute_ms:1,total_ms:10000}},options={abortSignal:controller.signal,toolCallId:'sdk-call'},message={id:'message'};
const processor={get message(){return message}};bindUnionInvocationProcessor(processor,message);
const source={owner,request,options,definition:{name:'dock_node_apply',inputSchema:{required:['budgets']}},sessionInput:{loginom:owner,session:{id:'session'},processor},user:{id:'user'}};
const packet=retainUnionInvocation(source);const rows=[];
async function refuses(name,args,user,signal,p,expected){const before=callCount;let caught=false;try{await owner.call(name,args,user,signal,p)}catch(e){caught=true;expected(e)}assert(caught);assert.equal(callCount,before);rows.push({name:rows.length+1,IO:0,pass:true})}
try{
 await refuses('dock_node_apply',request,'user',controller.signal,packet,e=>assert.equal(e.message,'ORIGINAL_UNION_ACQUIRED_PROVIDER_UNAVAILABLE'));
 await refuses('dock_node_apply',request,'user',controller.signal,undefined,e=>assert.equal(e.message,'UNION_INVOCATION_UNOWNED'));
 await refuses('dock_node_apply',request,'user',controller.signal,{...packet},e=>assert.equal(e.message,'UNION_INVOCATION_UNOWNED'));
 await refuses('dock_node_apply',{...request},'user',controller.signal,packet,e=>assert.equal(e.message,'UNION_INVOCATION_BINDING_CHANGED'));
 await refuses('dock_node_apply',request,'user',new AbortController().signal,packet,e=>assert.equal(e.message,'UNION_INVOCATION_BINDING_CHANGED'));
 const ordinary=owner.call('dock_diagnostics',{},'user');await new Promise(resolve=>setTimeout(resolve,20));assert.equal(callCount,1);
 // A queued ordinary request must not postpone the Union refusal.
 await Promise.race([refuses('dock_node_apply',request,'user',controller.signal,packet,e=>assert.equal(e.message,'ORIGINAL_UNION_ACQUIRED_PROVIDER_UNAVAILABLE')),new Promise((_,reject)=>setTimeout(()=>reject(Error('queued Union refusal')),100))]);
 port2.postMessage({id:pending.shift().id,result:'ordinary'});assert.equal(await ordinary,'ordinary');
 const expiredSource={...source,request:{...request,operation_id:'expired',budgets:{configure_ms:1,execute_ms:1,total_ms:1}},options:{abortSignal:controller.signal,toolCallId:'expired'}};
 const expiredPacket=retainUnionInvocation(expiredSource);await new Promise(resolve=>setTimeout(resolve,5));
 await refuses('dock_node_apply',expiredSource.request,'user',controller.signal,expiredPacket,e=>assert.equal(e.message,'UNION_INVOCATION_EXPIRED'));
 const foreign={generation:39,call:owner.call},foreignSource={...source,owner:foreign,sessionInput:{...source.sessionInput,loginom:foreign},options:{abortSignal:controller.signal,toolCallId:'foreign'}};
 const foreignPacket=retainUnionInvocation(foreignSource);
 await refuses('dock_node_apply',request,'user',controller.signal,foreignPacket,e=>assert.equal(e.message,'UNION_INVOCATION_UNOWNED'));
 controller.abort(false);await refuses('dock_node_apply',request,'user',controller.signal,packet,e=>assert.equal(e,false));
 const liveController=new AbortController(),liveSource={...source,request:{...request,operation_id:'released'},options:{abortSignal:liveController.signal,toolCallId:'released'}};
 const livePacket=retainUnionInvocation(liveSource);await owner.release();
 await refuses('dock_node_apply',liveSource.request,'user',liveController.signal,livePacket,e=>assert.equal(e.message,'UNION_INVOCATION_BINDING_CHANGED'));
 assert.equal(callCount,1);await writeFile(output,JSON.stringify({rows,pass:rows.length,ordinaryCalls:callCount,qualifiedProvider:false,registration:false,native:false,label:'actual adapter queue and MessageChannel; host generation reply is named acquisition double; same helper brand in original realm'},null,2));
}finally{disconnect();port1.close();port2.close()}
