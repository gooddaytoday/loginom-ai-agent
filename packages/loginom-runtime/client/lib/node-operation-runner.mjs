import {createHash} from 'node:crypto';

const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
 ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const checkId=id=>{if(typeof id!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(id))throw Error('Stable node operation ID required');};

// Host lifecycle only: a wait timeout never aborts the worker or starts another
// operation. The original runtime retains the mutation gate through cleanup.
export function createNodeOperationRunner({run,validate,progress}) {
 const jobs=new Map();
 const find=id=>{checkId(id);const job=jobs.get(id);if(!job)throw Error('Unknown node operation');return job;};
 const snapshot=job=>structuredClone({operation_id:job.id,attempt:job.attempt,state:job.state,
  cancel_requested:job.controller.signal.aborted,server_stop_requested:job.stopController.signal.aborted,
  progress:progress(job.id),outcome:job.outcome??null,error:job.error??null});
 const launch=(request,signature,attempt,resume,previous)=>{
  const job={id:request.operation_id,request:structuredClone(request),signature,attempt,state:'running',controller:new AbortController(),stopController:new AbortController()};
  jobs.set(job.id,job);
  // Claim the local ID before calling run, including its synchronous validation.
  // Both rejection and success settle this promise; no unhandled background error.
  let execution;
  try{execution=run(request,{signal:job.controller.signal,stopSignal:job.stopController.signal,resume});}catch(error){execution=Promise.reject(error);}
  job.completion=Promise.resolve(execution).then(
   outcome=>{job.outcome=structuredClone(outcome);job.state='settled';},
   error=>{
    // A refused continuation is not a new browser outcome. Keep the original
    // checkpoint and uncertainty so status/wait still expose a recovery route.
    job.outcome=previous?.outcome?structuredClone(previous.outcome):null;
    job.error={code:'NODE_WORKER_REJECTED',message:String(error.message).slice(0,1000),
     ...(job.outcome?.error?{original_error:structuredClone(job.outcome.error)}:{})};
    job.state='settled';
   });
  return snapshot(job);
 };
 return Object.freeze({
  get busy(){return [...jobs.values()].some(job=>job.state==='running');},
  get active(){const job=[...jobs.values()].find(job=>job.state==='running');return job?snapshot(job):null;},
  get unsettled(){return [...jobs.values()].some(job=>job.state==='running'||job.outcome?.status==='AMBIGUOUS'
    ||job.outcome?.effect_possible===true&&job.outcome?.cleanup_complete!==true);},
  start(request,{resume=false}={}) {
   request=structuredClone(request);checkId(request.operation_id);
   if(resume&&Object.keys(request).length===1)request=structuredClone(find(request.operation_id).request);
   const signature=digest({request,handler_revision:validate(request)}),old=jobs.get(request.operation_id);
   if(old) {
    if(old.signature!==signature)throw Error('Node operation ID was used with different parameters');
    if(!resume||old.state==='running'||old.outcome?.status==='SUCCEEDED'||old.outcome?.output?.execution?.status==='cancelled'
      ||old.outcome?.status==='FAILED'&&old.outcome.cleanup_complete===true&&old.outcome.output?.execution?.status==='failed'
        &&old.outcome.output.execution.failure_verified===true)return snapshot(old);
    if([...jobs.values()].some(job=>job.state==='running'))throw Error('Another node operation is running');
    return launch(request,signature,old.attempt+1,true,old);
   }
   if(resume)throw Error('Cannot resume an unknown node operation');
   if([...jobs.values()].some(job=>job.state==='running'))throw Error('Another node operation is running');
   return launch(request,signature,1,false);
  },
  status(id){return snapshot(find(id));},
  async wait(id,{timeoutMs=1000,signal}={}) {
   const job=find(id);
   if(!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>60000)throw Error('Node wait timeout must be 0..60000 ms');
   signal?.throwIfAborted();
   if(job.state!=='running'||timeoutMs===0)return snapshot(job);
   let timer,onAbort;
   const interrupted=new Promise((resolve,reject)=>{
    timer=setTimeout(resolve,timeoutMs);
    if(signal){onAbort=()=>reject(signal.reason??new Error('Node wait cancelled'));signal.addEventListener('abort',onAbort,{once:true});}
   });
   try{await Promise.race([job.completion,interrupted]);return snapshot(job);}
   finally{clearTimeout(timer);if(onAbort)signal.removeEventListener('abort',onAbort);}
  },
  stop(id) {
   const job=find(id);
   if(job.stopController.signal.aborted||job.state!=='running')return snapshot(job);
   const state=progress(job.id);
   if(state?.pending_phase!=='execute'||state.execution?.status!=='pending'||!state.execution.execution_id)
    throw Error('Server stop requires an identified execution currently being awaited');
   job.stopController.abort(new Error('Server node stop requested'));
   return snapshot(job);
  },
  cancel(id) {
   const job=find(id);
   if(job.state==='running')job.controller.abort(new Error('Local node cancellation requested'));
   return snapshot(job);
  },
 });
}
