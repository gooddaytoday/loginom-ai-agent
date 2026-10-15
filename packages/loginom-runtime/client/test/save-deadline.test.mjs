import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Page,runtime,actions} from './support/executor-fixture.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';

// Production supervisor request, managed call and bridge dispatch. IPC, MCP
// routing, Page/DOM and clock are named doubles; executor/browser body/journal run.
const supervisor=await readFile(new URL('../../../loginom-host/src/supervisor.ts',import.meta.url),'utf8');
const requestSource=supervisor.slice(supervisor.indexOf('  function request(operation:'),supervisor.indexOf('  const closing:',supervisor.indexOf('  function request(operation:')))
 .replace('operation: string, value?: unknown','operation, value').replace('new Promise<unknown>','new Promise');
const managed=await readFile(new URL('../../src/managed-entry.mjs',import.meta.url),'utf8');
const callStart=managed.indexOf('    const controller = new AbortController()',managed.indexOf('message.operation !== "call"'));
const callSource=managed.slice(callStart,managed.indexOf('  } catch (error)',callStart));
const bridge=await readFile(new URL('../lib/bridge.mjs',import.meta.url),'utf8');
const dispatchStart=bridge.indexOf(': await actionRuntime.run(args.action_key');
const dispatchSource=bridge.slice(dispatchStart+2,bridge.indexOf(';',dispatchStart));
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const dispatch=AsyncFunction('actionRuntime','args','extra','request','return '+dispatchSource);
const managedCall=AsyncFunction('message','state','send','Date',callSource);
function taskOf(code){const marker=')(page, {"action":',start=code.indexOf(marker)+')(page, '.length;let depth=0,quoted=false,escaped=false;
 for(let i=start;i<code.length;i++){const c=code[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(code.slice(start,i+1));}throw Error('Missing browser task');}
async function fixture({timeout=20000,delay=2000,legacy=false,hook=()=>{}}={}){
 const page=new Page(),tasks=[],records=[],controller=new AbortController(),directory=await mkdtemp(join(tmpdir(),'save-deadline-'));
 const journal=createExecutionJournal({directory,metadata:{sessionId:'save-test',clientRevision:'fixture'}});
 class Clock extends Date{static now(){return page.clock}}
 const pending=new Map();let message;
 const child={connected:true,send(value){message=value;pending.get(value.id).resolve('delivered')}};
 const request=Function('child','pending','randomUUID','setTimeout','Date','fail',requestSource+'return request')(child,pending,()=> 'ipc-id',()=>0,Clock,()=>{throw Error('IPC failed')});
 const args={action_key:'package.save_as',parameters:{path:'/user/data/packages/bounded.lgp',conflict_policy:'fail'},operation_id:'bounded-save'};
 await request('call',{name:'dock_action_run',arguments:args},timeout);assert.equal(message.deadline,1000+timeout);if(legacy)delete message.deadline;
 page.clock+=delay;
 const rt=runtime(page,{execute:async(code,opts)=>{const task=taskOf(code);tasks.push({mode:task.mode,deadline:task.deadline_at,timeout:opts.timeout});await hook('before-'+task.mode,{page,controller});const o=await page.execute(code);if(task.mode==='prepare')page.clock+=1000;await hook('after-'+task.mode,{page,controller});return o},onRecord:async row=>{records.push(row);await hook('record-'+row.phase,{page,controller});return journal(row)}});
 let outcome,toolOptions;
 const state={bridge:{hasUnsettledWork:()=>rt.hasUnsettledWork(),hasActiveWork:()=>rt.hasActiveWork()},client:{callTool:async(input,unused,options)=>{toolOptions=options;outcome=await dispatch(rt,args,{signal:controller.signal},{params:input});return outcome}}};
 return {page,rt,tasks,records,controller,run:()=>managedCall(message,state,()=>{},Clock),get outcome(){return outcome},get toolOptions(){return toolOptions},dispose:async name=>{if(process.env.REVIEW_RESULTS)await writeFile(join(process.env.REVIEW_RESULTS,name+'.json'),JSON.stringify({tasks,records,durable:await readFile(join(directory,'execution-events.jsonl'),'utf8').catch(()=>''),unsettled:rt.hasUnsettledWork()},null,2));await rm(directory,{recursive:true,force:true})}};
}
for(const [name,opts,bound] of [['original',{},21000],['sdk-cap',{timeout:300000},108000],['legacy',{legacy:true},undefined]])test('Save dispatch preserves '+name,async()=>{
 const f=await fixture(opts);try{await f.run();assert.equal(f.outcome.status,'SUCCEEDED');assert.equal(f.tasks[0].deadline,bound);if(bound){for(const t of f.tasks)assert.equal(t.deadline,bound);for(const r of f.records)assert.equal(r.deadline_at,bound);assert.equal(f.toolOptions.timeout,bound-3000)}else assert.equal(f.records[0].deadline_at,4000+actions.get('package.save_as').timeout_ms)}finally{await f.dispose(name)}
});
for(const at of ['before-prepare','after-prepare','record-prepared'])test('expiry before effect '+at,async()=>{
 const f=await fixture({hook:(stage,{page})=>{if(stage===at)page.clock=21000}});try{await assert.rejects(f.run,/Action deadline exceeded/);assert.equal(f.page.storage.size,0);assert(!f.tasks.some(t=>t.mode==='apply'))}finally{await f.dispose('expiry-'+at)}
});
for(const [i,reason] of [Error('lost reply'),0,undefined].entries())test('lost apply retains primary and pending '+i,async()=>{
 const f=await fixture({hook:stage=>{if(stage==='after-apply')throw reason;if(stage==='record-completed')throw Error('secondary journal failure')}});let caught=false,value;
 try{try{await f.run()}catch(e){caught=true;value=e}assert(caught);assert.equal(value,reason);assert.equal(f.page.storage.size,1);assert(f.rt.hasUnsettledWork())}finally{await f.dispose('lost-'+i)}
});
test('expired original IPC and abort0 prevent Save',async()=>{
 const f=await fixture({delay:20000});try{await assert.rejects(f.run,/LOGINOM_RUNTIME_TIMEOUT/);assert.equal(f.tasks.length,0)}finally{await f.dispose('ipc-expired')}
 const a=await fixture({hook:(stage,{controller})=>{if(stage==='after-prepare')controller.abort(0)}});let caught=false,value;try{try{await a.run()}catch(e){caught=true;value=e}assert(caught);assert.equal(value,0);assert.equal(a.page.storage.size,0)}finally{await a.dispose('abort-zero')}
});
