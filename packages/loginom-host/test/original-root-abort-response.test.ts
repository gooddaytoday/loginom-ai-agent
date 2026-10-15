import {test,expect} from 'bun:test';import {MessageChannel} from 'node:worker_threads';import {connect,acquire,disconnect} from '../src/adapter';import {mintOriginalRunControl} from '../src/original-run-control';
for(const reason of [false,0,null,'',undefined,Error('root',{cause:0})])test('original root reason dominates secondary transport error '+String(reason),async()=>{
 const controller=new AbortController(),control=mintOriginalRunControl(controller.signal,Date.now()+7200000),channel=new MessageChannel();let calls=0;
 channel.port2.on('message',m=>{if(m.method==='acquire')channel.port2.postMessage({id:m.id,result:{generation:1}});if(m.method==='call'){calls++;controller.abort(reason);channel.port2.postMessage({id:m.id,error:'LOGINOM_CALL_UNCERTAIN'})}});
 const port={postMessage:(value:any)=>channel.port1.postMessage(value),on:(_name:string,fn:(e:any)=>void)=>{channel.port1.on('message',data=>fn({data}))},start(){channel.port1.start()}};
 try{connect(port,{deferRelease:true,leases:new Set()},control);const lease=await acquire('chat');if(!lease)throw Error('lease');let failed=false,error;try{await lease.call('dock_prepare',{intent:'new_draft'},'message')}catch(e){failed=true;error=e}expect(failed).toBe(true);expect(error).toBe(controller.signal.reason);expect(calls).toBe(1)}finally{disconnect();channel.port1.close();channel.port2.close()}
});
