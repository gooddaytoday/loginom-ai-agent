// Page-local capabilities. Nothing here invokes model methods or remote RPCs.
export function armJavascriptNativeRoundtrip({binding,source,source_sha256}){
  const need=(v,m)=>{if(!v)throw Error('Roundtrip owner: '+m);};
  need(!globalThis.__loginomJavascriptNativeRoundtripV1,'already armed');
  const captured=globalThis.__loginomJavascriptNativeInputBindingV1,input=captured?.initial;
  const read=globalThis.__loginomJavascriptNativeInputReadV1;
  need(captured?.document===document&&input&&captured.id===binding.runtime_binding_id
    &&read?.document===document&&!read.poisoned&&!read.active&&read.last?.published===true
    &&read.last.id===binding.read_id&&read.last.status==='completed'&&read.last.pending===0
    &&read.last.releasedRequests===input.count&&read.last.releasedResponses===input.count
    &&(binding.fixture_id??'real')===input.fixtureId,'completed input before JS');
  need(input.diagram.FNodes.FCollection===input.nodes&&input.diagram.FLinks.FCollection===input.links
    &&input.links.length===0&&!input.nodes.some(n=>n.FIconCls==='bg-vendor-icon-javascript'),'input-only baseline');
  const inputCell=input.node.FCell,portCell=input.port.FCell;
  const value=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value;
  const tuple=c=>JSON.stringify([value(value(c,'$'),'$OW'),value(value(c,'$'),'$O'),value(value(c,'$'),'$I'),value(value(c,'$'),'$RRC'),value(c,'$FRefCount')]);
  const upstream=()=>{
    need(globalThis.__loginomDockPreparationV1===input.prep&&input.prep.document===document,'document');
    need(input.node.data===input.nodeData&&input.node.FGuid===binding.node_id&&input.node.FStatus===1&&input.node.FRunning===false
      &&input.node.FPorts===input.nodePorts&&input.node.FPorts[1].FCollection[0]===input.port
      &&input.port.parent===input.node&&input.port.data===input.portData&&input.port.FGuid===binding.port_guid
      &&input.node.FCell===inputCell&&input.port.FCell===portCell&&input.port.FType===1&&input.port.FSubType===1&&input.port.FParam===0&&input.port.FStatus===1
      &&input.nodePorts[0]===input.inputCollection&&input.inputCollection.FCollection===input.inputPorts
      &&input.inputPorts.length===2&&input.inputPorts[0]===input.connectionInput&&input.inputPorts[1]===input.variablesInput
      &&[6,3].every((subtype,i)=>input.inputPorts[i].parent===input.node&&input.inputPorts[i].FType===0&&input.inputPorts[i].FSubType===subtype&&input.inputPorts[i].FParam===1&&input.inputPorts[i].FStatus===1),'upstream node/port');
    need(input.ds.$===input.identity&&value(input.identity,'$OW')===input.owner&&value(input.identity,'$O')===input.object
      &&value(input.ds,'$FHelper')===input.helper&&value(input.helper,'$FData')===input.cache
      &&value(input.helper,'$FCacheInitialized')===true&&value(input.helper,'$FRowCount')===input.count
      &&value(input.helper,'$FDataChangeCookie')===input.dataCookie&&value(input.helper,'$FStateChangeCookie')===input.stateCookie
      &&tuple(input.dataCookie)===input.dataCookieValue&&tuple(input.stateCookie)===input.stateCookieValue
      &&value(input.dataCookie,'$')===input.dataCookieIdentity&&value(input.stateCookie,'$')===input.stateCookieIdentity
      &&Object.getPrototypeOf(input.dataCookie)===input.cookiePrototype&&Object.getPrototypeOf(input.stateCookie)===input.cookiePrototype
      &&Object.getPrototypeOf(input.dataCookieIdentity)===input.dataCookieIdentityPrototype&&Object.getPrototypeOf(input.stateCookieIdentity)===input.stateCookieIdentityPrototype
      &&value(input.cookiePrototype,'constructor')===input.cookieClass&&value(input.cookiePrototype,'$II')===input.cookieInterface
      &&value(input.dataCookie,'$S')===input.ds.$S&&value(input.stateCookie,'$S')===input.ds.$S
      &&input.field.Name==='Value'&&input.field.DisplayName==='Value'&&input.field.DataType===input.typeCode,'upstream dataset/subscriptions');
    need(input.child.data.ModelNode===input.nodeData&&input.child.data.Status===3&&input.child.data.ErrorDetails===''
      &&String(input.child.data.id)===binding.completed_child.process_id&&String(input.child.internalId)===binding.completed_child.process_record_id
      &&input.processStore.getRoot()===input.processRoot&&!input.processStore.isLoading(),'upstream execution');
    const pending=[...input.processRoot.childNodes],seen=new Set();
    while(pending.length){const r=pending.pop();need(r&&!seen.has(r)&&seen.size<2000&&!r.data.loading,'process loading/cycle');seen.add(r);
      need(r.data.ModelNode!==input.nodeData||Number(String(r.data.id).split('.')[0])<=Number(binding.completed_child.group_id),'upstream reexecuted');
      pending.push(...(r.childNodes??[]));}
    need(seen.has(input.child)&&seen.has(input.group),'upstream process removed');
    globalThis.__loginomJavascriptNativeRuntimeV1.check(input.ds.$S);
    return seen;
  };
  upstream();
  const card=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
  need(card===input.card&&card.Controller.FController===input.model&&input.manager.FPreviewVisible===false,'owned graph after Preview Close');
  globalThis.__loginomJavascriptNativeRoundtripV1={document,input,binding,source,source_sha256,upstream,bindings:new Map(),stage:'armed'};
  return {armed:true,input_read_id:binding.read_id,source_sha256};
}

export function bindJavascriptNativeRoundtripGraph({node,inputPortGuid}){
  const s=globalThis.__loginomJavascriptNativeRoundtripV1,need=(v,m)=>{if(!v)throw Error('Roundtrip graph: '+m);};
  need(s?.document===document&&s.stage==='armed','one graph admission');s.stage='graph-reserved';s.upstream();
  const initial=s.input,diagram=initial.diagram,nodes=diagram.FNodes.FCollection,links=diagram.FLinks.FCollection;
  const matches=nodes.filter(n=>n.FGuid===node.node_id&&n.FIconCls==='bg-vendor-icon-javascript');
  need(matches.length===1&&nodes.length<=3&&nodes.includes(initial.node)&&links.length===1,'single import→JS topology');
  const js=matches[0],edge=links[0],targetPort=edge.FTargetPort;
  const enumValue=(port,key)=>{
    const descriptor=Object.getOwnPropertyDescriptor(port??{},key);
    if(!descriptor)return 'missing';if(!Object.hasOwn(descriptor,'value'))return 'accessor';
    const value=descriptor.value;return Number.isInteger(value)&&value>=0&&value<=16?String(value):'other';
  };
  const checks={source:edge.FSourcePort===initial.port,parent:targetPort?.parent===js,
    collection:Array.isArray(js.FPorts?.[0]?.FCollection)&&js.FPorts[0].FCollection.includes(targetPort),
    guid:targetPort?.FGuid===inputPortGuid,type:targetPort?.FType===0,subtype:targetPort?.FSubType===1,
    // Probe02: optional + multiple is exactly 3; the graph still has one edge.
    param:targetPort?.FParam===3,edge_guid:typeof edge.FGuid==='string'&&edge.FGuid.length>0};
  if(!Object.values(checks).every(Boolean)){
    // Only bounded enum classes and identity booleans, never GUIDs, labels,
    // source handles or arbitrary property values. Fits the 500-char transport.
    need(false,'RG1 '+JSON.stringify({c:checks,f:Object.keys(checks).filter(k=>!checks[k]),
      v:['FType','FSubType','FParam'].map(key=>enumValue(targetPort,key))}));
  }
  need(nodes.filter(n=>n!==js&&n!==initial.node).every(n=>n.FIconCls==='bg-vendor-icon-modelvariables'&&n.FStatus===0&&!n.FRunning),'foreign dynamic nodes');
  const heldNodes=nodes.map(n=>({node:n,data:n.data,cell:n.FCell,guid:n.FGuid,icon:n.FIconCls,ports:n.FPorts,
    groups:n.FPorts.map(group=>({group,collection:group.FCollection,ports:group.FCollection.map(p=>({port:p,data:p.data,cell:p.FCell,guid:p.FGuid,type:p.FType,subtype:p.FSubType,param:p.FParam,parent:p.parent,prototype:Object.getPrototypeOf(p),constructor:Object.getPrototypeOf(p)?.constructor}))}))}));
  const edgeGuid=edge.FGuid,upstreamCheck=s.upstream;
  const checkGraph=()=>{
    const records=s.upstream();
    need(s.check===check&&s.checkGraph===checkGraph&&s.upstream===upstreamCheck,'owner checker replaced');
    need(globalThis.__loginomJavascriptNativeRoundtripV1===s&&s.document===document,'capability replaced');
    const card=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
    need(card===initial.card&&card.Controller.FController===initial.model&&initial.model.FDiagram===diagram
      &&diagram.FNodes.FCollection===nodes&&diagram.FLinks.FCollection===links&&nodes.length===heldNodes.length
      &&links.length===1&&links[0]===edge&&edge.FGuid===edgeGuid&&edge.FSourcePort===initial.port&&edge.FTargetPort===targetPort,'graph/edge identity');
    need(!initial.model.FCreateDraggedNodeStarted&&!initial.model.FDraggingOverGraph&&!initial.model.FDraggedNode,'graph gesture');
    for(const n of heldNodes){need(nodes.includes(n.node)&&n.node.data===n.data&&n.node.FCell===n.cell&&n.node.FGuid===n.guid
      &&n.node.FIconCls===n.icon&&n.node.FPorts===n.ports&&n.ports.length===n.groups.length,'node identity');
      for(const [i,g]of n.groups.entries()){need(n.ports[i]===g.group&&g.group.FCollection===g.collection&&g.collection.length===g.ports.length,'port collection');
        for(const [j,p]of g.ports.entries())need(g.collection[j]===p.port&&p.port.data===p.data&&p.port.FCell===p.cell&&p.port.FGuid===p.guid
          &&p.port.FType===p.type&&p.port.FSubType===p.subtype&&p.port.FParam===p.param&&p.port.parent===p.parent
          &&Object.getPrototypeOf(p.port)===p.prototype&&Object.getPrototypeOf(p.port)?.constructor===p.constructor,'port identity');}}
    if(s.executionWitness){const w=s.executionWitness;
      need(!s.bindings.get('output')||js.FStatus===1&&js.FRunning===false&&js.FPorts[1].FCollection[0].FStatus===1,'completed JS output inactive');
      need(records.has(w.child)&&records.has(w.group)&&w.child.data.ModelNode===js.data&&w.child.data.Status===3&&w.child.data.ErrorDetails===''
        &&String(w.child.data.id)===s.execution.process_id&&String(w.child.internalId)===s.execution.process_record_id
        &&w.group.data.Status===3&&w.group.data.ErrorDetails===''&&w.group.data.loaded===true
        &&initial.processRoot.childNodes.includes(w.group),'JS execution changed');
      need(JSON.stringify([...records].map(r=>[r.internalId,r.data.id,r.data.Status,r.data.ErrorDetails,r.data.ModelNode===js.data]))===w.fingerprint,'process history changed');}

  };
  const check=()=>{checkGraph();if(s.sourceWitness)need(s.sourceWitness.verify()===s.source,'source changed');};
  Object.assign(s,{node:js,targetPort,edge,check,checkGraph,stage:'graph-bound'});check();
  // Read-only inventory, not an admission rule for unobserved output metadata.
  const inventory=group=>({count:group.FCollection.length>8?'>8':String(group.FCollection.length),
    values:group.FCollection.slice(0,8).map(port=>['FType','FSubType','FParam','FStatus','FPortIndex'].map(key=>enumValue(port,key)))});
  return {bound:true,node_id:js.FGuid,input_port_guid:targetPort.FGuid,edge_guid:edgeGuid,
    ports:{input:inventory(js.FPorts[0]),output:inventory(js.FPorts[1])}};
}

export function bindJavascriptNativeRoundtripSchema({root,native,binding,schema}){
  const s=globalThis.__loginomJavascriptNativeRoundtripV1,need=(v,m)=>{if(!v)throw Error('Roundtrip schema: '+m);};
  need(s?.stage==='graph-bound'&&s.node===binding.native&&s.node.data===binding.nodeData,'owned schema stage');s.upstream();
  const tab=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),model=tab.Controller.FController;
  need(tab===s.input.card&&tab.Controller.Node.data.node===native&&model.FView.el.dom===root
    &&schema.verified===true&&schema.generation?.checked===true,'owned code schema');
  const tid=schema.generation.tid.replace(/;DisplayEl$/,'');
  const controls=[...root.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')],control=controls.length===1&&Ext.getCmp(controls[0].id);
  need(control?.el?.dom===controls[0]&&control.checked===true,'generation control');
  s.schemaWitness={root,native,model,control,element:controls[0]};s.stage='schema-bound';
  return {verified:true,schema_mode:'code'};
}

export function bindJavascriptNativeRoundtripSource({root,native,binding,schema}){
  const s=globalThis.__loginomJavascriptNativeRoundtripV1,need=(v,m)=>{if(!v)throw Error('Roundtrip source: '+m);};
  need(s?.stage==='schema-bound'&&s.node===binding.native&&s.node.data===binding.nodeData,'owned JS source');s.upstream();
  const tab=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
  need(tab===s.input.card&&tab.Controller.Node.data.node===native&&tab.Controller.FController.FView.el.dom===root
    &&schema.verified===true&&schema.generation?.checked===true,'owned code schema');
  const witness=s.schemaWitness,control=witness.control;
  need(root===witness.root&&native===witness.native&&tab.Controller.FController===witness.model
    &&control.checked===true&&control.el?.dom===witness.element,'same applied code mode');
  const editors=[...root.querySelectorAll('.CodeMirror')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
  need(editors.length===1,'one source editor');const cm=editors[0].CodeMirror,doc=cm.getDoc();
  const admittedSource=s.source,admittedDigest=s.source_sha256;
  const read=()=>{need(s.source===admittedSource&&s.source_sha256===admittedDigest,'admitted source changed');need(control.checked===true&&control.el?.dom===witness.element,'code-generation changed');need(cm.getDoc()===doc&&doc.firstLine()===0&&doc.lineCount()>=1&&doc.lineCount()<=32,'source identity');
    return Array.from({length:doc.lineCount()},(_,i)=>doc.getLine(i)).join('\n');};
  need(read()===s.source,'exact source readback');
  let applied;
  const verify=()=>{
    if(!applied)return read();
    need(s.done===applied&&applied.source===admittedSource&&applied.source===s.source&&applied.source_sha256===admittedDigest&&applied.source_sha256===s.source_sha256
      &&applied.schema_mode==='code'&&['done-sealed','execution-reserved','completed'].includes(s.stage),'sealed source/mode changed');
    return applied.source;
  };
  const seal=receipt=>{
    need(!applied&&s.pendingDone===receipt&&s.stage==='done-prepared','one prepared Done');
    applied=Object.freeze({...receipt,status:'sealed'});s.done=applied;s.stage='done-sealed';
  };
  s.sourceWitness={doc,read,verify,seal};s.stage='source-bound';
  return {verified:true,source_sha256:s.source_sha256,schema_mode:'code'};
}

// A live wizard attestation is reserved immediately before the one gesture.
// Disposal by itself is never a success signal and cannot authorize Execute.
export function prepareJavascriptNativeRoundtripWizard({context,before,identity,stage,deadline}){
  const s=globalThis.__loginomJavascriptNativeRoundtripV1,need=(v,m)=>{if(!v)throw Error('Roundtrip wizard: '+m);};
  need(s?.document===document&&s.stage==='source-bound'&&['next','done'].includes(stage)&&Date.now()<deadline,'live source stage/deadline');
  const w=s.schemaWitness,tab=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
  need(context.root===w.root&&context.native===w.native&&context.binding.native===s.node&&context.binding.nodeData===s.node.data
    &&w.root.isConnected===true&&tab===s.input.card&&tab.Controller.Node.data.node===w.native
    &&tab.Controller.FController===w.model&&w.model.FView?.el?.dom===w.root,'same live wizard');
  need(before?.owner_verified===true&&before.wizard_visible===true&&!before.pending&&!before.boundary_refusal
    &&identity.node_id===s.node.FGuid&&identity.source_sha256===s.source_sha256&&typeof identity.effect_id==='string'&&identity.effect_id,'owned gesture identity');
  need(typeof before.page_tid==='string'&&before.page_tid.startsWith(context.prefix+';WizrdMCF;')
    &&(stage!=='done'||before.page_tid===context.prefix+';WizrdMCF;DoneWizard'),'exact Done page');
  const pages=[...w.root.querySelectorAll('[data-tid='+JSON.stringify(before.page_tid)+']')].filter(e=>e.isConnected&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
  need(pages.length===1,'same visible page');s.upstream();need(s.sourceWitness.read()===s.source,'source changed before gesture');
  if(stage==='done'){
    s.pendingDone=Object.freeze({effect_id:identity.effect_id,node_id:identity.node_id,source_sha256:s.source_sha256,
      source:s.source,schema_mode:'code',deadline});s.stage='done-prepared';
  }
  return {verified:true,stage,effect_id:identity.effect_id,node_id:identity.node_id,source_sha256:s.source_sha256,schema_mode:'code'};
}

export function sealJavascriptNativeRoundtripDone({identity,confirmation}){
  const s=globalThis.__loginomJavascriptNativeRoundtripV1,need=(v,m)=>{if(!v)throw Error('Roundtrip Done: '+m);};
  const receipt=s?.pendingDone,w=s?.schemaWitness;
  need(s?.document===document&&s.stage==='done-prepared'&&receipt&&Date.now()<receipt.deadline,'one pending Done within deadline');
  need(['effect_id','node_id','source_sha256'].every(k=>identity?.[k]===receipt[k])
    &&receipt.source===s.source&&receipt.source_sha256===s.source_sha256&&receipt.schema_mode==='code','prepared source/mode/identity');
  need(confirmation?.effect_settled===true&&confirmation.terminal===true&&confirmation.after?.wizard_visible===false
    &&confirmation.after.pending===false&&!confirmation.after.boundary_refusal&&confirmation.no_new_messages===true,'confirmed original Done required');
  const tab=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
  need(tab===s.input.card&&tab.Controller.Node.data.node===s.input.workflow&&tab.Controller.FController===s.input.model
    &&(!w.root.isConnected||!w.root.getBoundingClientRect().width||!w.root.getBoundingClientRect().height),'same graph and hidden original wizard');
  // If the original control survives, it must still agree. A disposed control
  // is accepted only at this matched, settled Done -> original-graph boundary.
  if(w.control.el?.dom)need(s.sourceWitness.read()===receipt.source,'surviving source/mode changed');
  s.checkGraph();s.sourceWitness.seal(receipt);s.check();
  return {verified:true,effect_id:receipt.effect_id,node_id:receipt.node_id,source_sha256:receipt.source_sha256,
    schema_mode:'code',basis:'live_pre_done_attestation_and_confirmed_own_done_graph',execution_from_wizard:'ambiguous'};
}

export function completeJavascriptNativeRoundtrip({execution,source_sha256}){
  const s=globalThis.__loginomJavascriptNativeRoundtripV1;
  if(s?.stage!=='done-sealed'||source_sha256!==s.source_sha256||execution?.verified!==true||execution.owner_verified!==true
    ||execution.status!=='completed'||!execution.process_id||!execution.process_record_id||!execution.group_id
    ||execution.trial?.source_sha256!==s.source_sha256)throw Error('Roundtrip completed JS child required');
  s.stage='execution-reserved';s.check();
  const records=[...s.upstream()],children=records.filter(r=>r.data.ModelNode===s.node.data&&String(r.data.id)===execution.process_id&&String(r.internalId)===execution.process_record_id);
  const groups=records.filter(r=>String(r.data.id)===execution.group_id);
  if(children.length!==1||groups.length!==1)throw Error('Exact JS process objects required');
  s.execution=execution;s.executionWitness={child:children[0],group:groups[0],fingerprint:JSON.stringify(records.map(r=>[r.internalId,r.data.id,r.data.Status,r.data.ErrorDetails,r.data.ModelNode===s.node.data]))};
  s.stage='completed';s.check();
  return {verified:true,execution_id:execution.execution_id,source_sha256};
}
