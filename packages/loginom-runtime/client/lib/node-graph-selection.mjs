// A selected node's hover controls can cover the entire SVG body. Its observed
// label remains a native selection target; never click the execution overlay.
export function preparedGraphSelection(state) {
  const node=state.prepared_node_context;
  if(node?.verified!==true||node.surface!=='graph'||typeof node.tid!=='string')throw Error('Prepared graph node required for selection');
  for(const [part,tid] of [['body',node.tid],['label',node.tid+';Label;Label']]) {
    const matches=state.ui.elements.filter(e=>e.tid===tid&&e.graph_node?.part===part
      &&e.allowed_actions.includes('click')&&e.interaction?.state==='point_observed');
    if(matches.length>1)throw Error('Prepared graph selection is ambiguous');
    if(matches.length===1)return {verb:'click',ref:matches[0].ref};
  }
  throw Error('Prepared graph node has no observed selection point');
}

// A failed graph selection may observe a new SVG body for the same native node.
// Do not generalize this proof to labels, controls, hidden bodies or other errors.
export function isPreparedBodyReplacement({receipt,observation,action}) {
  const after=receipt?.output,a=observation?.prepared_node_context,b=after?.prepared_node_context;
  const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
  if(action?.verb!=='click'||a?.verified!==true||b?.verified!==true
    ||a.surface!=='graph'||b.surface!=='graph'||a.locked!==false||b.locked!==false
    ||!['document_id','workflow_id','node_id','tid'].every(k=>typeof a[k]==='string'&&a[k].length>0&&a[k]===b[k])
    ||!['origin','loginom_build','workflow_ref','graph_identity'].every(k=>observation[k]!==undefined&&same(observation[k],after[k]))
    ||typeof observation.dom_epoch?.document!=='string'||observation.dom_epoch.document!==after.dom_epoch?.document
    ||after.scan?.complete!==true||!Array.isArray(after.ui?.elements)
    ||!['dialogs','masks'].every(k=>Array.isArray(after.ui[k])&&after.ui[k].length===0&&after.ui.truncated?.[k]===false))return false;
  const before=observation.ui?.elements?.filter(e=>e.ref===action.ref&&e.tid===a.tid)??[];
  const fresh=after.ui.elements.filter(e=>e.tid===a.tid);
  if(before.length!==1||fresh.length!==1)return false;
  const old=before[0],next=fresh[0];
  return typeof next.ref==='string'&&next.ref!==old.ref
    &&[old,next].every(e=>e.scope==='graph'&&e.graph_node?.part==='body'
      &&e.allowed_actions?.includes('click')&&e.interaction?.state==='point_observed')
    &&same(old.identity,next.identity)&&same(old.signature,next.signature);
}

export async function selectPreparedGraphNode(channel, initialObservation, condition, {refreshReplacedBody=false}={}) {
  const node=initialObservation.prepared_node_context;
  const same=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'
    &&['document_id','workflow_id','node_id','tid'].every(k=>s.prepared_node_context[k]===node[k]);
  let label=false;
  const refresh=refreshReplacedBody?{refreshReplacedBody:isPreparedBodyReplacement}:{};
  await channel.perform({condition,initialObservation,ready:same,identity:()=>node,...refresh,resolve:s=>{
    const action=preparedGraphSelection(s);
    label=s.ui.elements.find(e=>e.ref===action.ref)?.graph_node?.part==='label';
    return action;
  }});
  if(label) {
    // Moving to the label dismisses Loginom's hover overlay. A fresh body click
    // then exposes the settings controls just as in the ordinary path.
    const restored=await channel.observe({condition:'prepared body visible after leaving hover controls',ready:s=>same(s)
      &&s.ui.elements.some(e=>e.tid===node.tid&&e.graph_node?.part==='body'&&e.interaction?.state==='point_observed')});
    await channel.perform({condition:'select prepared body after hover dismissal',initialObservation:restored,ready:same,identity:()=>node,...refresh,
      resolve:s=>{const action=preparedGraphSelection(s);if(s.ui.elements.find(e=>e.ref===action.ref)?.graph_node?.part!=='body')throw Error('Prepared body remains covered');return action;}});
  }
}
