import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, open, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {retainUnionConfigureCleanup, unionCleanupWitness} = await import(process.env.UNION_CLEANUP_MODULE
  ? pathToFileURL(process.env.UNION_CLEANUP_MODULE).href : '/home/user/multica_workspaces/lab-6462f220cf3b/lab-68-7f7796fd6c5c/workdir/loginom-ai-agent/packages/loginom-runtime/client/lib/union-configure-cleanup.mjs');
const deferred = () => {let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject};};

// Page/controller/native methods and logical lease are explicit doubles.
// Receipt open/write/fsync/close/readback are real filesystem operations.
async function fixture(targetType = 'transform.union') {
  const directory = await mkdtemp(join(tmpdir(),'union-partial-'));
  const abort = new AbortController(), counts={close:0,read:0,write:0};
  const node = {document_id:'document',workflow_id:'workflow',node_id:'node'};
  const operation = {id:'original',signature:'original-signature',parameters:{operation_id:'original',target:{type:'transform.union'},inputs:[{id:'input0'}]},
    nodeApply:{node,phases:[{phase:'target',value:{effect_possible:true}},{phase:'input_mapping'},{phase:'open'}],pending:{phase:'configure',receipt_id:'original:configure'},execution:{status:'not_requested'}},
    outcome:{status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false,error:{code:'NODE_APPLY_STOPPED',message:'first'},accepted_effects:['target','input','open']}};
  const prepared={wizard:{status:'observed',root_ref:'root',root_tid:'wizard',stage:'union',owner_context:{status:'observed',node:{tid:'original-node'}}},prepared_node_context:{verified:true,surface:'wizard',...node},ui:{dialogs:[],masks:[]}};
  let terminal={wizard:{status:'absent'},prepared_node_context:{verified:true,surface:'graph',locked:false,...node},ui:{dialogs:[],masks:[]}};
  let closeHook=async()=>{}, readHook=async()=>{}, writeHook=async()=>{};
  const originalClose=async operands=>{counts.close++; assert.equal(operands.signal,abort.signal);assert.equal(operands.deadline,1000);return closeHook();};
  const tuple=Object.fromEntries(['owner','run','lease','chat','account','session','page','context','package','workflow','node','wizard','controller'].map(k=>[k,{}]));
  Object.assign(tuple,{generation:7,close:originalClose,signal:abort.signal,deadline:1000});
  const current={...tuple,running:false,dirty:false,writerPending:false,transportUnknown:false};
  let clock=0;
  const record=async event=>{
    counts.write++; await writeHook();
    const f=await open(join(directory,'partial.json'),'w',0o600);
    try{await f.writeFile(JSON.stringify(event));await f.sync();}finally{await f.close();}
    return JSON.parse(await readFile(join(directory,'partial.json'),'utf8'));
  };
  operation.parameters.target.type=targetType;
  let scope;
  try {scope=retainUnionConfigureCleanup({operation,tuple,current:()=>current,prepared,originalClose,
    observeTerminal:async operands=>{counts.read++;assert.equal(operands.signal,abort.signal);await readHook();return terminal;},record,signal:abort.signal,deadline:1000,now:()=>clock});} catch(error){await rm(directory,{recursive:true});throw error;}
  const primary=Error('AMBIGUOUS original',{cause:0}); scope.holdFailure(primary);
  return {operation,current,tuple,scope,counts,primary,abort,directory,
    closeHook:f=>closeHook=f, readHook:f=>readHook=f,writeHook:f=>writeHook=f,
    terminal:v=>terminal=v,clock:v=>clock=v,cleanup:()=>rm(directory,{recursive:true})};
}
async function control(fn){const f=await fixture();try{await fn(f);}finally{await f.cleanup();}}


export {fixture, deferred, unionCleanupWitness};
