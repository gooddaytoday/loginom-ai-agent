import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {closeManagedResources} from '../../src/managed-resources-close.mjs';

const source=readFileSync(new URL('../../src/managed-entry.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('const stop ='),source.indexOf('process.on("message"'));
for(const policy of ['last_confirmed_own_save','opened_saved_package','unsaved_draft'])
for(const missing of ['package_closed','logged_out'])test(policy+' refuses ACK without '+missing,async()=>{
 const events=[];
 await assert.rejects(closeManagedResources({browser:{close:async()=>events.push('browser')},
  bridge:{close:async()=>({browser_transport_closed:true,browser_process_terminated:true,clipboard_leases_retained:0,
   package_cleanup:{policy,status:'SUCCEEDED',package_closed:true,logged_out:true,[missing]:false}})}},[]),
 /LOGINOM_RUNTIME_CLEANUP_FAILED/);
 assert.deepEqual(events,['browser']);
});
test('an unprepared ordinary runtime still skips native cleanup',async()=>{
 await closeManagedResources({bridge:{close:async()=>({browser_transport_closed:true,browser_process_terminated:true,
  clipboard_leases_retained:0,package_cleanup:{policy:'last_confirmed_own_save',status:'SKIPPED_UNPREPARED'}})}},[]);
});
for(const signal of ['SIGINT','SIGTERM','SIGHUP'])for(const policy of ['last_confirmed_own_save','opened_saved_package','unsaved_draft'])
for(const dirty of [false,true])test(signal+' orders native close/logout before browser; '+policy+' dirty='+dirty,async()=>{
 const events=[],timers=[];const process=new EventEmitter();let done;
 process.exit=code=>{events.push('exit:'+code);done?.();};
 const state={browser:{close:async()=>events.push('browser')},client:{close:async()=>events.push('client')},
  bridge:{close:async()=>{events.push('saved-state');events.push(dirty?'UNSAVED_CHANGES':'native-close');if(!dirty)events.push('logout');
   return {browser_transport_closed:true,browser_process_terminated:true,clipboard_leases_retained:0,
    package_cleanup:{policy,status:dirty?'BLOCKED':'SUCCEEDED',package_closed:!dirty,logged_out:!dirty}};}}};
 const finished=new Promise(resolve=>{done=resolve;});
 vm.runInNewContext(body,{state,process,terminalTrace:()=>{},close:()=>closeManagedResources(state,[]),
  setTimeout:(fn,ms)=>{const timer={fn,ms,unref(){}};timers.push(timer);return timer;},clearTimeout:()=>{}});
 assert.equal(process.listenerCount(signal),1);
 process.emit(signal);process.emit(signal);await finished;
 assert.deepEqual(events,['client','saved-state',dirty?'UNSAVED_CHANGES':'native-close',...dirty?[]:['logout'],'browser','exit:'+(dirty?1:0)]);
 assert.equal(timers.length,1);assert.equal(timers[0].ms,30000);
});
test('signal cleanup budget records possible lock and closes only its own browser before failed exit',async()=>{
 const events=[],timers=[],process=new EventEmitter();process.exit=code=>events.push('exit:'+code);
 const state={browser:{close:async()=>events.push('browser')}};
 vm.runInNewContext(body,{state,process,terminalTrace:stage=>events.push(stage),close:()=>new Promise(()=>{}),
  setTimeout:(fn,ms)=>{const timer={fn,ms,unref(){}};timers.push(timer);return timer;},clearTimeout:()=>{}});
 process.emit('SIGINT');assert.equal(events.includes('browser'),false);
 timers[0].fn();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(events,['stop_requested','cleanup_budget_exhausted_lock_may_remain','browser','exit:1']);
});
