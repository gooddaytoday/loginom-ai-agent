import {requireJavascriptTopology} from './javascript-link-topology.mjs';

// Discover by the current native icon/GUID and verified graph endpoints. Neither
// writer references nor saved labels/ordinals are accepted as selection inputs.
export function javascriptColdNodes(graph, observed, prepared) {
  requireJavascriptTopology(graph);
  if (graph.document_id !== prepared.document_id || graph.workflow_ref.workflow_id !== prepared.workflow_ref.workflow_id
    || JSON.stringify(graph.workflow_ref) !== JSON.stringify(prepared.workflow_ref)
    || ![2, 3].includes(graph.nodes.length) || graph.links.length !== 1 || graph.foreign_links.length
    || observed?.native_model !== true || observed.prefix !== prepared.workflow_ref.prefix || observed.running !== false
    || !Array.isArray(observed.nodes) || observed.nodes.length !== graph.nodes.length
    || new Set(observed.nodes.map(node => node.id)).size !== graph.nodes.length
    || observed.nodes.some(node => !node.rendered || !node.tid || !graph.nodes.some(item => item.ref.node_id === node.id)))
    throw Error('Cold saved graph identity incomplete');
  const js = observed.nodes.filter(node => node.icon_class === 'bg-vendor-icon-javascript');
  const imports = observed.nodes.filter(node => node.icon_class === 'bg-vendor-icon-importtextfile');
  const variables = observed.nodes.filter(node => node.icon_class === 'bg-vendor-icon-modelvariables');
  if (js.length !== 1 || imports.length !== 1 || variables.length > 1 || js.length + imports.length + variables.length !== graph.nodes.length) throw Error('Cold unique import/JavaScript nodes required');
  const target = graph.nodes.find(node => node.ref.node_id === js[0].id);
  const input = graph.nodes.find(node => node.ref.node_id === imports[0].id);
  const edge = graph.links[0];
  if (target.locked || input.locked
    || JSON.stringify(target.inputs) !== '[0]' || JSON.stringify(target.outputs) !== '[0]'
    || JSON.stringify(input.inputs) !== '[]' || JSON.stringify(input.outputs) !== '[0]'
    || edge.source !== input.ref.node_id || edge.target !== target.ref.node_id || edge.input !== 0 || edge.output !== 0)
    throw Error('Cold import/JavaScript topology differs');
  return structuredClone({node: target.ref, input: input.ref, rendered: js[0]});
}

export function observeJavascriptWizardBinding({id,tid,icon,owned}) {
  const app=globalThis.bg?.app,f=app?.Application?.FInstance?.FMainForm;
  const tab=f?.Items?.Workspace?.getActiveTab?.(),workflow=tab?.Controller?.Node?.data?.node;
  const diagram=tab?.Controller?.FController?.FDiagram,nodes=diagram?.FNodes?.FCollection;
  const matches=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===id):[];
  const ancestors=new Set();
  for(let n=workflow;n&&ancestors.size<32&&!ancestors.has(n);n=n.ParentNode)ancestors.add(n);
  if(!app?.WorkFlowTreeNode||!(workflow instanceof app.WorkFlowTreeNode)||!ancestors.has(owned)
    ||matches.length!==1||!matches[0].data||matches[0].FIconCls!==icon
    ||diagram.FmxGraph.view.getState(matches[0].FCell)?.shape?.node?.getAttribute('data-tid')!==tid)throw Error('Wizard source binding unavailable');
  return {document,tab,workflow,nodeData:matches[0].data,native:matches[0],cell:matches[0].FCell};
}
