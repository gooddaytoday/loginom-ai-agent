import {test,expect} from 'bun:test'
import {EventEmitter} from 'node:events'
const {connect,acquire,disconnect}=await import(process.env.SORTING_ADAPTER_BUNDLE??new URL('../src/adapter.ts',import.meta.url).href)
for(const refused of [undefined,0,false,'',null,new Error('native',{cause:0}),{cleanupComplete:false,rejected:0},'success'])test('ordinary finalizer -> same retained Sorting capture -> release: '+String(refused),async()=>{
 const messages=new EventEmitter(),events:string[]=[],owner={deferRelease:true,leases:new Set<any>(),audit:{phase:'ordinary' as 'ordinary'|'capture',authorization:'fixed-host-secret'}};
 let actualRun='';
 connect({on:messages.on.bind(messages),start(){},postMessage(m:any){events.push(m.method);if(m.method==='acquire')actualRun=m.input.run;
  if(m.method==='acceptance.capture'){expect(m.input.run).toBe(actualRun);expect(m.input.authorization).toBe(owner.audit.authorization)}
  const result=m.method==='acquire'?{generation:7}:m.method==='acceptance.capture'?(refused==='success'?{cleanupComplete:true}:refused):{};
  queueMicrotask(()=>messages.emit('message',{data:{id:m.id,result}}))}},owner);
 try{
 const lease=await acquire('same-chat');await lease.release();expect(events).toEqual(['acquire']);expect(owner.leases.size).toBe(1);
 owner.audit.phase='capture';if(refused==='success')await lease.release();else await expect(lease.release()).rejects.toThrow('LOGINOM_SORTING_AUDIT_REFUSED');
 expect(events).toEqual(['acquire','acceptance.capture']);expect(owner.leases.size).toBe(1);
 await expect(lease.release()).rejects.toThrow('LOGINOM_SORTING_AUDIT_REPLAY');expect(events).toHaveLength(2);
 if(refused==='success'){owner.deferRelease=false;await lease.release();expect(events).toEqual(['acquire','acceptance.capture','release'])}
 }finally{disconnect()}
})
