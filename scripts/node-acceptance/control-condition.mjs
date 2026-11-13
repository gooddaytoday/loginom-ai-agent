import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';

// condition-variable: the CSV of the selected branch is the same table for both
// branches, so the branch itself is proved by internal checkpoints: round 0
// reads only port 0 with activity [true,false], round 1 (after Mode := 0, same
// node, no reconfiguration) reads only port 1 with activity [false,true].
const activity=r=>JSON.stringify((r.output?.branch_activity??[]).map(b=>[b.port,b.executed]));
const want={0:JSON.stringify([[0,true],[1,false]]),1:JSON.stringify([[0,false],[1,true]])};
const same=(a,b)=>['document_id','workflow_id','node_id'].every(k=>a?.[k]===b?.[k]);
export function checkConditionBranches(initial,final,events){
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true
  &&e.result.execution?.status==='completed'&&e.result.configuration?.readback?.kind==='control_condition'?[{index,result:e.result}]:[]);
 const round=(c,expected)=>{
  const w=expected.outputs[0],r=c.result,ports=r.output?.ports??[],p=ports[0],cond=r.configuration.readback.branches?.[0]?.conditions;
  return ports.length===1&&p.port===w.output_port&&p.fresh===true&&p.execution_id===r.execution.execution_id&&p.sample_complete===true
   &&matchesExpectedOutput(p,w)&&activity(r)===want[w.output_port]&&r.configuration.readback.branches[1]?.name==='Иначе'
   &&cond?.length===1&&cond[0].relation==='='&&cond[0].value===1;
 };
 const first=checkpoints.find(c=>round(c,initial)&&c.result.configuration.readback.branches[0].conditions[0].variable==='Mode');
 if(!first)throw Error('CONDITION_BRANCH_INITIAL');
 const node=first.result.node;
 const patch=events.findIndex((e,i)=>i>first.index&&e.phase==='node_apply_prepared'&&e.request?.target?.type==='variables.user'
  &&e.request.parameters?.variables?.some(v=>v.name==='Mode'&&v.value===0));
 if(patch<0)throw Error('CONDITION_MODE_UPDATE');
 const second=checkpoints.find(c=>c.index>patch&&same(c.result.node,node)&&round(c,final)&&c.result.execution.execution_id!==first.result.execution.execution_id);
 if(!second)throw Error('CONDITION_BRANCH_FINAL');
 const requests=events.flatMap((e,index)=>e.phase==='node_apply_prepared'?[{index,request:e.request}]:[]);
 if(requests.filter(r=>r.request?.target?.type==='control.condition'&&r.request.target.kind==='new').length!==1
  ||requests.some(r=>!['imports.text','variables.user','control.condition','exports.text'].includes(r.request?.target?.type)))throw Error('CONDITION_SUBSTITUTE_NODE');
 for(const {index,request:r} of requests){
  if(index<=first.index||r.target.type!=='control.condition')continue;
  if(r.target.kind!=='existing'||!same(r.target.ref,node)||Object.keys(r.parameters??{}).length||r.inputs?.length||r.variable_inputs?.length||r.mappings?.length||r.bindings?.length)
   throw Error('CONDITION_RECONFIGURED');
 }
 return {status:'PASS',node,executions:[first.result.execution.execution_id,second.result.execution.execution_id],
  branch_activity:[first.result.output.branch_activity,second.result.output.branch_activity].map(a=>a.map(b=>b.executed))};
}

// Cold: the saved Condition is executed by the stock cold reader without
// restoring settings; exactly the branch whose port is read must be active.
export function checkColdConditionActivity(outputs,port){
 const ports=outputs?.verified===true&&outputs.surface==='graph'?outputs.ports:null;
 if(!Array.isArray(ports)||ports.length!==2)throw Error('CONDITION_COLD_PORTS');
 const active=ports.filter(p=>p.active===true).map(p=>p.index);
 if(active.length!==1||active[0]!==port)throw Error('CONDITION_COLD_BRANCH_ACTIVITY: active '+JSON.stringify(active)+', read port '+port);
 return ports.map(p=>({port:p.index,label:p.label,executed:p.active===true}));
}
export async function inspectColdConditionBranches(channel,port){
 const observed=await channel.observe({condition:'cold Condition branch ports after execution',readOutputs:true,
  ready:s=>s.node_outputs?.verified===true&&s.node_outputs.surface==='graph'&&s.node_outputs.ports?.filter(p=>p.active===true).length===1});
 return checkColdConditionActivity(observed.node_outputs,port);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [initial,final,events]=await Promise.all(process.argv.slice(2).map(p=>readFile(p,'utf8').then(JSON.parse)));
 console.log(JSON.stringify(checkConditionBranches(initial,final,events)));
}
