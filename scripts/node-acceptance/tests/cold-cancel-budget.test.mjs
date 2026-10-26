import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';

const source=readFileSync(new URL('../cold-check.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('const state ='),source.indexOf('try {\nconst authenticated'));
for(const signal of ['SIGINT','SIGTERM','SIGHUP'])test('cold '+signal+' waits for native finally, then bounds a stuck cleanup',async()=>{
 const events=[],timers=[],writes=new Map(),process=new EventEmitter();process.exit=code=>events.push('exit:'+code);
 const fixture=vm.createContext({process,saved:{path:'/own/saved.lgp'},args:{output:'cold'},
  join:(...p)=>p.join('/'),writeFile:async(name,body)=>writes.set(name,JSON.parse(body)),
  setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeout:()=>{},
  fakeContext:{close:async()=>events.push('browser')}});
 vm.runInContext(body+'\ncontext=fakeContext;',fixture);
 assert.equal(process.listenerCount(signal),1);
 process.emit(signal);process.emit(signal);
 assert.deepEqual(events,[],'signal must not close the browser before finally');
 assert.equal(timers.length,1);assert.equal(timers[0].ms,30000);
 await timers[0].fn();
 const result=writes.get('cold/result.json');
 assert.equal(result.status,'FAIL');assert.equal(result.error,'COLD_CANCELLED');
 assert.equal(result.cancellation.cleanup_budget_exhausted,true);assert.equal(result.cancellation.lock_may_remain,true);
 assert.deepEqual(events,['browser','exit:1']);
});
