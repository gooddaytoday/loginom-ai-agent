import {createNodeProcedure} from './node-procedure.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export function collapseExistingSource(request,graph){
 need(graph.complete===true&&graph.document_id===request.document_id&&JSON.stringify(graph.workflow_ref)===JSON.stringify(request.workflow_ref),'Collapse source graph ownership changed');
 const target=request.target.ref.node_id,links=graph.links.filter(l=>l.target===target&&l.input===0);
 need(links.length<=1,'Collapse input is ambiguous');
 const explicit=request.inputs.find(i=>i.input===0),link=links[0];
 if(explicit){need(!link||link.source===explicit.source.node_id&&link.output===explicit.output,'Collapse existing input differs');return explicit;}
 if(!link)return null;
 const nodes=graph.nodes.filter(n=>n.ref.node_id===link.source);need(nodes.length===1,'Collapse source owner is ambiguous');
 return {source:nodes[0].ref,output:link.output,input:0};
}
export async function requireCollapseSourceReady(options,ctx,config){
 const {operation,execute,onRecord,now}=options,request=operation.parameters;
 if(request.target.kind!=='existing')return;
 const graph=await operation.nodeTargetAdapter.observe(request,ctx.deadline,ctx.signal),input=collapseExistingSource(request,graph);
 if(!input)return;
 const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:16,...config,signal:ctx.signal,
  preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node:input.source}});
 const s=await channel.observe({condition:'collapse inherited source readiness before input wizard',readOutputs:true,
  ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_outputs?.verified===true});
 const ports=s.node_outputs.ports.filter(p=>p.index===input.output);need(ports.length===1,'Collapse source port is ambiguous');
 if(ports[0].active!==true){const e=Error('Collapse requires an active upstream output before opening input mapping; execute the source first');e.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw e;}
}
