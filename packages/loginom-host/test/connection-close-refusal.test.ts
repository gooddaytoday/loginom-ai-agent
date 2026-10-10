import {test,expect} from 'bun:test'
const {connectionService}=await import(process.env.CONNECTION_SERVICE_SOURCE??new URL('../src/connection/connection-service.ts',import.meta.url).href)
async function fixture() {
 let refuse=true,closeCalls=0,finish:any,stored:any,acknowledged=0
 const originalError=Error('PERSISTENCE_REFUSAL'),page={},handle={page,close:async()=>{closeCalls++;if(finish)await finish.promise;if(refuse)throw originalError}}
 const active={generation:1,revision:1,url:'http://example.test',username:'own',password:'',apiKey:'fixture'}
 const store={read:async()=>active,pending:async()=>undefined,latestGeneration:async()=>1,savePending:async(v:any)=>stored=v,clearPending:async()=>stored=undefined}
 const service=await connectionService(store,{check:async()=>{},prepare:async()=>handle},{pending:()=>[],acknowledge:async()=>acknowledged++})
 await service.settled()
 const candidate={revision:1,url:active.url,username:'own',apiKey:{operation:'preserve'},password:{operation:'preserve'}}
 return {service,page,handle,candidate,originalError,get closeCalls(){return closeCalls},setRefuse:(v:boolean)=>refuse=v,block:()=>{let resolve:any;const promise=new Promise(r=>resolve=r);finish={promise,resolve};return resolve}}
}
test('original rejection and original page survive; same owner acquires after refusal',async()=>{
 const f=await fixture();let rejected;try{await f.service.close()}catch(e){rejected=e}
 expect(rejected).toBe(f.originalError);expect(f.handle.page).toBe(f.page);const lease=f.service.acquire('old-owner');expect(lease?.generation).toBe(1);lease?.release();f.setRefuse(false);await f.service.close()
})
test('existing guarded acknowledgeRecovery remains available, no new generation',async()=>{
 const f=await fixture();await expect(f.service.close()).rejects.toBe(f.originalError);const view=await f.service.api.acknowledgeRecovery({revision:1,ids:[]});expect(view.generation).toBe(1);f.setRefuse(false);await f.service.close()
})
test('pre-existing validation is preserved across repeated refused close',async()=>{
 const f=await fixture();const lease=f.service.acquire('hold');const v=await f.service.api.check(f.candidate)
 await expect(f.service.close()).rejects.toBe(f.originalError);await expect(f.service.close()).rejects.toBe(f.originalError)
 const view=await f.service.api.save({revision:1,validationId:v.validationId});expect(view.state).toBe('pending');expect(view.revision).toBe(2);f.setRefuse(false);await f.service.close();lease?.release()
})
test('pending survives close refusal without stale rollback',async()=>{
 const f=await fixture();const lease=f.service.acquire('hold');const v=await f.service.api.check(f.candidate);await f.service.api.save({revision:1,validationId:v.validationId})
 await expect(f.service.close()).rejects.toBe(f.originalError);expect((await f.service.api.read()).state).toBe('pending');expect((await f.service.api.read()).revision).toBe(2)
 expect(f.service.acquire('blocked')).toBeUndefined();const cancelled=await f.service.api.cancelPending({revision:2});expect(cancelled.revision).toBe(3);f.setRefuse(false);await f.service.close();lease?.release()
})
test('concurrent close uses one attempt and preserves newer validation after failure',async()=>{
 const f=await fixture();const resolve=f.block();const a=f.service.close(),b=f.service.close();expect(a).toBe(b);await Promise.resolve();await Promise.resolve();expect(f.closeCalls).toBe(1);resolve();await expect(a).rejects.toBe(f.originalError);await expect(b).rejects.toBe(f.originalError)
 const lease=f.service.acquire('hold-after');const v=await f.service.api.check(f.candidate);f.setRefuse(false);await f.service.api.save({revision:1,validationId:v.validationId});expect((await f.service.api.read()).revision).toBe(2);await f.service.close();lease?.release()
})
test('successful repeated close does not replay handle shutdown',async()=>{const f=await fixture();f.setRefuse(false);await f.service.close();await f.service.close();expect(f.closeCalls).toBe(1);expect(f.service.acquire('after')).toBeUndefined()})
test('startup without a created handle closes successfully',async()=>{const service=await connectionService({read:async()=>undefined,pending:async()=>undefined,latestGeneration:async()=>0},{check:async()=>{},prepare:async()=>{throw Error('not reached')}});await service.close();await service.close()})
