import {randomUUID} from 'node:crypto';
import {verifyJavascriptTable} from './javascript-execution-evidence.mjs';
import {javascriptMismatchVerdict} from './javascript-mismatch-probe.mjs';

export const javascriptBatchOrder=Object.freeze([
  'code-table-execute','code-sentinel-preview','declared-sentinel-preview',
  'code-sentinel-execute','declared-sentinel-execute','declared-table-execute',
  'code-table-mismatch','declared-sentinel-next','declared-sentinel-done',
  'code-sentinel-next','code-sentinel-done',
]);

export function javascriptBatchCases(cases) {
  if(!Array.isArray(cases)||!cases.length||cases.length>11||new Set(cases).size!==cases.length
    ||cases.some(value=>!javascriptBatchOrder.includes(value)))throw Error('Expected 1–11 unique supported JavaScript cases');
  return [...cases];
}

export function caseEffect(caseId,id) {
  return caseId&&!id.startsWith(caseId+':')?caseId+':'+id:id;
}

// Observing an owned UI transition is distinct from proving script execution.
// A missing sentinel may continue only after independent graph settlement.
export function javascriptBatchVerdict(executionCase,probe,settled) {
  if(settled?.owner_verified!==true||settled.wizard_closed!==true||settled.quiet!==true
    ||!Number.isInteger(settled.node_count)||settled.node_count<2||settled.node_count>20)
    throw Error('Batch case settlement unconfirmed');
  if(executionCase.includes('-sentinel-')) {
    const outcome=probe?.outcome;
    if(outcome?.terminal_observed!==true||!['next','done','preview','execute'].includes(outcome.stage)
      ||outcome.stage!=='done'&&outcome.owner_verified!==true)
      throw Error('Batch mutation outcome or owner unconfirmed');
    if(outcome.stage==='execute'&&(probe.execution?.verified!==true||probe.execution.owner_verified!==true))
      throw Error('Batch execution terminal unconfirmed');
    const requested=executionCase.split('-').at(-1);
    return {safe_to_continue:true,gate_passed:outcome.stage===requested&&outcome.gate_passed===true,
      requested_stage:requested,observed_stage:outcome.stage,execution:outcome.execution,
      absence_proves_no_execution:false};
  }
  if(probe?.status!=='typed_output_verified'||probe.execution?.verified!==true
    ||probe.execution.status!=='completed'||probe.execution.owner_verified!==true
    ||probe.existing_readback?.source_verified!==true||probe.existing_readback.mode_verified!==true
    ||probe.existing_readback.port_mappings_unchanged!==true)
    throw Error('Batch table proof incomplete');
  verifyJavascriptTable(probe.output,'output');
  const mismatch=probe.existing_readback.generated_schema_mismatch_trial;
  if(executionCase==='code-table-mismatch')return javascriptMismatchVerdict(mismatch,probe.execution);
  return {safe_to_continue:true,gate_passed:true,execution:'confirmed',absence_proves_no_execution:false};
}

export async function runJavascriptBatch({cases,deadline,begin,run,settle,record,now=Date.now}) {
  const plan=javascriptBatchCases(cases),nodes=new Set();
  for(const execution_case of plan) {
    if(now()>=deadline)throw Error('Original batch deadline expired');
    const entry={case_id:randomUUID(),execution_case,started_at:new Date(now()).toISOString()};
    try {
      await begin(entry);
      if(now()>=deadline)throw Error('Original batch deadline expired');
      const result=await run(entry);
      if(!result?.node_id||nodes.has(result.node_id))throw Error('Batch requires an independent fresh node');
      nodes.add(result.node_id);
      const settled=await settle(entry,result);
      const verdict=javascriptBatchVerdict(execution_case,result.probe,settled);
      await record({status:'OBSERVED',node_id:result.node_id,settlement:settled,verdict,finished_at:new Date(now()).toISOString()});
    } catch(error) {
      await record({status:'FAILED',failure:{name:error.name,message:String(error.message)},finished_at:new Date(now()).toISOString()});
      throw error;
    }
  }
}

export const javascriptBatchInputIdentity=({held,input})=>{
    const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const diagram=tab?.Controller?.FController?.FDiagram,nodes=diagram?.FNodes?.FCollection;
    return document===held.document&&tab===held.tab&&tab.Controller===held.controller&&diagram===held.diagram
      &&Array.isArray(nodes)&&nodes.length<=20&&nodes.filter(n=>n.FGuid===input.node.node_id).length===1
      &&nodes.find(n=>n.FGuid===input.node.node_id)===held.node&&held.node.data===held.data&&held.node.FCell===held.cell
      &&held.node.FPorts?.flatMap(list=>list.FCollection??[]).filter(p=>p.FGuid===input.table.port_guid).length===1
      &&held.node.FPorts.flatMap(list=>list.FCollection??[]).find(p=>p.FGuid===input.table.port_guid)===held.port;
  };

export const javascriptDropPoint=e=>{
      const b=e.getBoundingClientRect(),model=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
      const diagram=model?.FDiagram,nodes=diagram?.FNodes?.FCollection;
      if(diagram?.FmxGraph?.container!==e||!Array.isArray(nodes)||nodes.length>=20)throw Error('Drop graph inventory refused');
      const occupied=nodes.map(n=>{const element=diagram.FmxGraph.view.getState(n.FCell)?.shape?.node;
        if(!element?.isConnected||!e.contains(element))throw Error('Drop native shape unavailable');return element.getBoundingClientRect();});
      // Reserve a full visible node footprint, not merely an empty center pixel.
      for(let y=Math.max(80,b.top+80);y<Math.min(innerHeight,b.bottom)-80;y+=140)
        for(let x=Math.max(100,b.left+100);x<Math.min(innerWidth,b.right)-100;x+=180){
          if(occupied.some(r=>x+85>r.left-20&&x-85<r.right+20&&y+65>r.top-20&&y-65<r.bottom+20))continue;
          const hit=document.elementFromPoint(x,y);
          if(hit&&(hit===e||e.contains(hit))&&!hit.closest('[data-tid*=";Graph;"]')&&!hit.closest('path,line,polyline'))return{x,y};
        }
      throw Error('No observed empty drop footprint');
    };
