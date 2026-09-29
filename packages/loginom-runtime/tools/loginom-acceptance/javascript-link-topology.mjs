import {verifyNodeTargetEffect} from '../../client/lib/node-target.mjs';

const key=edge=>JSON.stringify([edge.source,edge.output,edge.target,edge.input]);
const domain=graph=>({...graph,nodes:graph.nodes.map(({dom_epoch,...node})=>node)});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function requireJavascriptTopology(graph) {
  if(graph?.complete!==true||graph.interaction_ready!==true||!Array.isArray(graph.nodes)||graph.nodes.length>20
    ||!Array.isArray(graph.links)||graph.links.length>400||!Array.isArray(graph.foreign_links)
    ||new Set(graph.nodes.map(n=>n.ref.node_id)).size!==graph.nodes.length
    ||new Set(graph.links.map(key)).size!==graph.links.length)
    throw Error('JavaScript graph topology incomplete or duplicate');
  if(graph.nodes.some(n=>n.ref.document_id!==graph.document_id||n.ref.workflow_id!==graph.workflow_ref.workflow_id
    ||!Array.isArray(n.inputs)||!Array.isArray(n.outputs)
    ||new Set(n.inputs).size!==n.inputs.length||new Set(n.outputs).size!==n.outputs.length))
    throw Error('JavaScript node/port identity differs');
  if(graph.links.some(e=>!graph.nodes.some(n=>n.ref.node_id===e.source&&n.outputs.includes(e.output))
    ||!graph.nodes.some(n=>n.ref.node_id===e.target&&n.inputs.includes(e.input))))
    throw Error('JavaScript link endpoint/port identity differs');
}

export function requireJavascriptGraphUnchanged(before,after) {
  requireJavascriptTopology(before);requireJavascriptTopology(after);
  if(!same(domain(before),domain(after)))throw Error('JavaScript complete graph changed');
}

export function javascriptCreatedTopology(before,after,source,id) {
  requireJavascriptTopology(before);requireJavascriptTopology(after);
  if(source.document_id!==before.document_id||source.workflow_id!==before.workflow_ref.workflow_id
    ||before.nodes.filter(n=>n.ref.node_id===source.node_id&&n.outputs.includes(0)).length!==1)
    throw Error('JavaScript source output identity differs');
  // The graph adapter reports the catalog runtime type; the palette icon is
  // verified separately by the native owner checks around this transition.
  const created=verifyNodeTargetEffect({kind:'create',before,parameters:{type:'programming.javascript'}},after);
  if(!created||created.node_id!==id)throw Error('JavaScript palette topology delta differs');
  const target=after.nodes.find(n=>n.ref.node_id===id);
  if(!same(target.inputs,[0])||!same(target.outputs,[0]))throw Error('JavaScript single input/output ports differ');
  const desired={source:source.node_id,output:0,target:id,input:0};
  if(created.auto_created_links.length>1||created.auto_created_links.some(edge=>key(edge)!==key(desired)))
    throw Error('JavaScript palette created an unexpected link');
  return {node:target.ref,desired,adopt:created.auto_created_links.length===1};
}

// Cached native objects only. Returned handles stay in the page; no server
// getters or mutations, and no inference from labels or matching GUID alone.
export function captureJavascriptNativeTopology({previous=null,addedId=null,checkOnly=false}={}) {
  const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const controller=tab?.Controller,model=controller?.FController,diagram=model?.FDiagram,graph=diagram?.FmxGraph;
  const collection=diagram?.FNodes?.FCollection;
  if(!graph?.container||!Array.isArray(collection)||collection.length>20)throw Error('JavaScript native graph unavailable');
  const nodes=collection.map(node=>{
    if(!node.FGuid||!node.data||!node.FCell||!Array.isArray(node.FPorts)||node.FPorts.length>16)
      throw Error('JavaScript native node/port collection unavailable');
    const ports=node.FPorts.flatMap(list=>{
      if(!Array.isArray(list.FCollection)||list.FCollection.length>100)throw Error('JavaScript native port bound');
      return list.FCollection.map(port=>({port,guid:port.FGuid,data:port.data,cell:port.FCell,
        type:port.FType,subtype:port.FSubType,parent:port.parent}));
    });
    return {node,guid:node.FGuid,data:node.data,cell:node.FCell,ports};
  });
  if(new Set(nodes.map(n=>n.guid)).size!==nodes.length)throw Error('JavaScript native node duplicate');
  if(previous){
    if(document!==previous.document||tab!==previous.tab||controller!==previous.controller||model!==previous.model
      ||diagram!==previous.diagram||graph!==previous.graph||graph.container!==previous.container)
      throw Error('JavaScript native graph owner changed');
    const added=nodes.filter(n=>!previous.nodes.some(old=>old.guid===n.guid));
    if(added.length!==(addedId===null?0:1)||addedId!==null&&added[0]?.guid!==addedId)
      throw Error('JavaScript native created delta differs');
    for(const old of previous.nodes){
      const current=nodes.find(n=>n.guid===old.guid);
      if(!current||current.node!==old.node||current.data!==old.data||current.cell!==old.cell||current.ports.length!==old.ports.length
        ||old.ports.some((port,index)=>Object.keys(port).some(k=>current.ports[index][k]!==port[k])))
        throw Error('JavaScript prior native node/port changed');
    }
  }
  if(checkOnly)return {verified:true,nodes:nodes.length,ports:nodes.reduce((sum,n)=>sum+n.ports.length,0)};
  return {document,tab,controller,model,diagram,graph,container:graph.container,nodes};
}

export async function connectJavascriptInput({source,id,drop,graph,checkNative,connect,record,allowAutoLink=true}) {
  let before;
  try {
    before=await graph();
    await record({phase:'javascript_input_link_baseline',source,id,before,drop_before:drop,
      target_candidates:before.nodes.filter(n=>n.ref.node_id===id),incoming:before.links.filter(e=>e.target===id)});
    await checkNative();
    const decision=javascriptCreatedTopology(drop,before,source,id);
    if(decision.adopt&&!allowAutoLink)throw Error('Alt palette drag produced an automatic link');
    if(decision.adopt){
      // The palette gesture already produced exactly the requested edge.
      // Recheck after the durable observation; never send a second gesture.
      await record({phase:'javascript_input_link_adoption_prepared',source,id,edge:decision.desired,effect_dispatched:false});
      await checkNative();
      const after=await graph();requireJavascriptTopology(after);
      if(!same(domain(before),domain(after)))throw Error('JavaScript adopted topology changed');
      await record({phase:'javascript_input_link_adopted',source,id,edge:decision.desired,effect_dispatched:false,before,after});
      return decision.node;
    }
    const effect={id:'js-link-'+id,kind:'connect',before,parameters:{edge:decision.desired}};
    const linked=await connect(effect);
    if(linked.status!=='SUCCEEDED')throw Error('JavaScript link gesture unconfirmed');
    await checkNative();
    const after=await graph();requireJavascriptTopology(after);
    if(!verifyNodeTargetEffect(effect,after)||after.links.length!==before.links.length+1)
      throw Error('JavaScript input link topology not preserved');
    await record({phase:'input_link_verified',before,after});return decision.node;
  } catch(error) {
    await record({phase:'javascript_input_link_refused',source,id,reason:String(error.message),before});
    throw error;
  }
}
