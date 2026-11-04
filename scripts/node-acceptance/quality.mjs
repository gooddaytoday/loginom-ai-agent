import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';

function* receipts(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.node&&value.output?.ports&&value.execution)yield value;
 for(const child of Object.values(value))if(child&&typeof child==='object')yield* receipts(child);
}
// Uses the stock typed matcher on the full production receipts. Model-facing
// compaction can omit whole sample rows; it cannot create acceptance evidence.
export function checkQualityMain(initial,updated,events){
 const need=(v,m)=>{if(!v)throw Error('QUALITY_'+m);};
 const successful=[...receipts(events)].filter(r=>r.cleanup_complete===true);
 const complete=successful.filter(r=>r.execution.status==='completed');
 const configured=complete.filter(r=>r.configuration?.readback?.kind==='quality');
 need(configured.length>0,'NATIVE_NODE_MISSING');
 const ids=new Set(configured.map(r=>r.node.node_id));need(ids.size===1,'NODE_REPLACED');
 const id=[...ids][0],rounds=[];
 for(const r of complete){
  if(r.node.node_id!==id||rounds.some(p=>p.execution.execution_id===r.execution.execution_id))continue;
  if(r.output.ports.length!==5)continue;
  need(r.output.ports.every(p=>p.fresh===true&&p.execution_id===r.execution.execution_id&&p.freshness_basis==='completed_execution_port_source'),'PORT_EXECUTION');
  need(new Set(r.output.ports.map(p=>p.port)).size===5,'PORT_IDENTITIES');rounds.push(r);
 }
 const matches=(r,want)=>want.outputs.every(o=>{const port=r.output.ports.find(p=>p.port===o.output_port);return port&&matchesExpectedOutput(port,o);});
 const first=rounds.findIndex(r=>matches(r,initial));need(first>=0,'INITIAL_VALUES');
 const last=rounds.findIndex((r,i)=>i>first&&matches(r,updated));need(last>first,'UPDATED_VALUES');
 // Done commits the source without executing the import. A subsequent Quality
 // execution must still prove the updated values on all five fresh outputs.
 const imports=successful.slice(0,successful.indexOf(rounds[last])).filter(r=>r.configuration?.readback?.kind==='text_import'
  &&(r.execution.status==='completed'||r.execution.status==='not_requested'&&r.configuration.status==='applied'
   &&r.configuration.readback.scope==='observed_before_verified_finish'));
 need(new Set(imports.map(r=>r.node.node_id)).size===1&&new Set(imports.map(r=>r.configuration.readback.source.source_path)).size>=2,'SAME_IMPORT_UPDATED_SOURCE');
 return {node_id:id,execution_ids:[rounds[first].execution.execution_id,rounds[last].execution.execution_id],ports:[0,1,2,3,4],status:'PASS'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [initial,updated,events]=await Promise.all(process.argv.slice(2).map(p=>readFile(p,'utf8').then(JSON.parse)));
 console.log(JSON.stringify(checkQualityMain(initial,updated,events)));
}
