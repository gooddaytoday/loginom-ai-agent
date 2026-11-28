import {isDeepStrictEqual} from 'node:util';
import {sameDomainGraph} from './node-target.mjs';

const idPattern=/^[A-Za-z0-9_.:-]{1,128}$/;
export function stepWriteTool(name,args) {
  return ['dock_node_apply','dock_node_delete','dock_node_resume'].includes(name)
    ||name==='dock_action_run'&&['package.save_checkpoint','package.save_as'].includes(args?.action_key);
}

const sameScope=(a,b)=>!!a&&!!b&&a.document_id===b.document_id&&a.workflow_ref?.workflow_id===b.workflow_ref?.workflow_id;
const quiet=state=>state?.status==='READY'&&state.graph?.complete===true&&state.graph.interaction_ready===true
  &&state.graph.nodes.every(node=>node.locked===false);
const sameWindow=(a,b)=>quiet(a)&&quiet(b)&&sameScope(a,b)&&a.modified===b.modified
  &&isDeepStrictEqual(a.package_ref,b.package_ref)&&sameDomainGraph(a.graph,b.graph);
function replyReceipt(reply,id) {
  if(reply?.structuredContent?.operation_id===id)return reply.structuredContent;
  try {
    const value=JSON.parse(reply?.content?.[0]?.text);
    if(value?.operation_id===id)return value;
  }catch{ /* A non-JSON refusal carries no operation receipt. */ }
}
const noEffect=receipt=>['NOT_APPLIED','FAILED'].includes(receipt?.status)
  &&receipt.error?.code!=='SAVE_RESULT_MISMATCH'&&receipt.effect_possible===false&&receipt.cleanup_complete===true;

export function createStepRetry({workspace,observe,receipt,settleUnapplied,busy,unsettled,confirmedSave,label}) {
  const steps=new Map();
  let blocked, completed, saved;
  let sequence=0;

  const facts=step=>{
    const save=saved?.scope&&sameScope(saved.scope,step.scope)?saved.fact:null;
    const outcome=step.outcome;
    return {v:1,operationId:step.id,state:'settled',step:{
      outcome,retryAvailable:outcome==='not_applied',
      ...(step.reason?{reason:step.reason}:{}),
      persistence:save&&(step.id===save.operationId||step.sequence<=saved.throughSequence)&&outcome==='completed'?'saved_through'
        :outcome==='not_applied'||outcome==='completed'&&step.modified===true?'step_unsaved':'unknown',
      save,
    }};
  };

  function admit(name,args) {
    if(!stepWriteTool(name,args))return;
    if(blocked&&!(name==='dock_node_resume'&&args?.operation_id===blocked.id&&blocked.checked))
      return {blocked:facts(blocked)};
    const id=args?.operation_id;
    if(typeof id!=='string'||!idPattern.test(id)||steps.has(id)||receipt(id))return;
    const step={id,sequence:++sequence,scope:workspace(),save:name==='dock_action_run',name,
      label:label(name,args)};
    steps.set(id,step);
    return {step};
  }

  async function finish(name,args,reply,admitted,signal) {
    const value=reply?.structuredContent;
    // Status and wait carry the original ID even when their own request was refused.
    const id=admitted?.id??((stepWriteTool(name,args)||['dock_node_status','dock_node_wait','dock_operation_inspect','dock_operation_recover'].includes(name))
      ?args?.operation_id:undefined);
    const step=steps.get(id);
    if(!step)return reply;
    const current=receipt(id)??replyReceipt(reply,id);
    if(noEffect(current))step.unapplied=true;
    if(!step.outcome&&value?.state==='running'){
      if(value.operation_id===id)return reply;
      if(value.request_rejected===true)step.unapplied=true;
    }
    const save=step.save?confirmedSave(id):null;
    if((!step.outcome||step.outcome==='check_required')&&(save||!step.save&&current?.status==='SUCCEEDED'&&current.cleanup_complete===true)){
      const scope=workspace();
      // A late poll of an older operation cannot replace a newer cutoff.
      if(save&&(!saved||step.sequence>saved.sequence)){
        const through=sameScope(step.scope,completed?.scope)&&completed.sequence<step.sequence?completed:step;
        const cutoff=through.id===saved?.fact.operationId?saved.fact.throughStep:{operationId:through.id,label:through.label};
        saved={scope,sequence:step.sequence,throughSequence:through.sequence,fact:{
          operationId:id,path:save.path,throughStep:cutoff,
        }};
      }
      step.scope=save?scope:step.scope;
      step.outcome='completed';
      delete step.reason;
      if(!completed||step.sequence>completed.sequence){
        completed=step;
        if(sameScope(step.scope,scope)&&!busy()){
          const state=await observe(scope,signal).catch(()=>null);
          if(quiet(state)){
            step.graph=state.graph;
            step.modified=state.modified;
          }
        }
      }
    }else if(!step.outcome){
      if(current?.error?.code==='NODE_GRAPH_CONFLICT') {
        step.outcome='check_required';
        step.reason='graph_conflict';
      } else if(step.unapplied||!unsettled()&&!current&&reply?.isError===true){
        step.outcome='not_applied';
      } else {
        step.outcome='check_required';
        step.reason='unknown_write';
      }
      if(step.outcome==='check_required'){
        if(current?.error?.code==='SAVE_RESULT_MISMATCH'
          ||current?.status==='FAILED'&&current.cleanup_complete===true&&!unsettled()&&step.reason!=='graph_conflict')
          step.reason='partial_effect';
        else blocked=step;
      }
    }
    return reply?{...reply,_meta:{...reply._meta,loginomStep:facts(step)}}:reply;
  }

  async function check(id,signal) {
    const step=steps.get(id),scope=workspace();
    const unavailable={state:'unavailable',retryAvailable:false};
    if(!step||!sameScope(step.scope,scope))return unavailable;
    if(busy())return {state:'busy',retryAvailable:false};
    const first=await observe(scope,signal).catch(()=>null);
    if(!quiet(first))return unavailable;
    const second=await observe(scope,signal).catch(()=>null);
    if(!sameWindow(first,second)||!sameScope(scope,workspace())||signal.aborted)return unavailable;
    if(step.outcome==='check_required'){
      const current=receipt(id);
      if(step.save?confirmedSave(id):current?.status==='SUCCEEDED'&&current.cleanup_complete===true){
        await finish('dock_operation_inspect',{operation_id:id},null,undefined,signal);
      }else if(blocked===step){
        const clean=!unsettled()&&(step.unapplied||noEffect(current))
          ||await settleUnapplied(id,second.graph,signal).catch(()=>false);
        if(clean)step.outcome='not_applied';
        else if(!unsettled()&&current?.status==='FAILED'&&current.cleanup_complete===true)blocked=undefined;
      }
      step.checked=true;
    }
    if(blocked===step&&step.outcome!=='check_required')blocked=undefined;
    const last=sameScope(scope,completed?.scope)?completed:null;
    return {state:'observed',retryAvailable:!blocked&&!unsettled()&&step.outcome==='not_applied',
      window:{path:second.package_ref.path,modified:second.modified,nodeCount:second.graph.nodes.length,
        linkCount:second.graph.links.length+(second.graph.variable_links?.length??0)+second.graph.foreign_links.length},
      lastConfirmedStep:last?{operationId:last.id,label:last.label}:null,
      graphSinceLastConfirmedStep:last?.graph?sameDomainGraph(last.graph,second.graph)?'same':'changed':'unknown',
      step:facts(step).step};
  }

  return {admit,finish,check,has:id=>steps.has(id)};
}
