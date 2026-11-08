import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';

// Match both full production checkpoints against the independent stage-0 oracle.
export function checkCorrRanksMain(expected,events){
 const need=(v,m)=>{if(!v)throw Error('CORR_RANKS_'+m);};
 const checkpoints=events.filter(e=>e.phase==='node_checkpoint').map(e=>e.result).filter(r=>r?.status==='SUCCEEDED'
  &&r.cleanup_complete===true&&r.execution?.status==='completed'&&r.configuration?.readback?.kind==='corr_analysis');
 const rounds=[];
 for(const mode of ['spearman','kendall']){
  const round=checkpoints.find((r,index)=>{
   const c=r.configuration.readback,p=r.output?.ports?.find(p=>p.port===0);
   return c.mode===mode&&JSON.stringify(c.coefficients)===JSON.stringify([mode])&&JSON.stringify(c.first_set)==='["X"]'
    &&JSON.stringify(c.second_set)==='["Y"]'&&p?.fresh===true&&p.execution_id===r.execution.execution_id
    &&p.freshness_basis==='completed_execution_port_source'&&matchesExpectedOutput(p,expected.cases[mode].outputs[0])
    &&(!rounds.length||index>checkpoints.indexOf(rounds[0])&&r.execution.execution_id!==rounds[0].execution.execution_id);
  });
  need(round,'TYPED_'+mode.toUpperCase());rounds.push(round);
 }
 need(['document_id','workflow_id','node_id'].every(k=>rounds[0].node[k]===rounds[1].node[k]),'SAME_NODE');
 const requests=events.filter(e=>e.phase==='node_apply_prepared').map(e=>e.request);
 need(requests.filter(r=>r.target?.type==='research.corr_analysis'&&r.target.kind==='new').length===1
  &&requests.every(r=>['imports.text','research.corr_analysis','exports.text'].includes(r.target?.type)),'NATIVE_GRAPH');
 return {status:'PASS',node:rounds[0].node,executions:rounds.map(r=>r.execution.execution_id)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [expected,events]=await Promise.all(process.argv.slice(2).map(p=>readFile(p,'utf8').then(JSON.parse)));
 console.log(JSON.stringify(checkCorrRanksMain(expected,events)));
}
