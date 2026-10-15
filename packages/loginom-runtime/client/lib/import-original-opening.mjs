// Fixed Import-only Page slot. Raw objects stay on the original preparation
// receipt; no returned JSON or historical pin can recreate this slot.
export function makeImportOpeningCode(task,mode) {
 if(!['reserve','complete','assert','read'].includes(mode))throw Error('LOGINOM_IMPORT_OPENING_MODE');
 return `async page=>page.evaluate(${importOpeningPage.toString()},${JSON.stringify({task,mode})})`;
}

export function importOpeningPage({task,mode}) {
 const fail=m=>{throw Error('LOGINOM_IMPORT_NATIVE_OPENING_'+m);};
 const own=(o,k)=>{const d=o&&Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))fail('OWN_DATA');return d.value;};
 // Loginom7.4.2 exposes these properties through fixed prototype getters.
 // Read only their inert cached fields; never execute a supplied accessor.
 const connectionValue=(o,k)=>{
  if(!o||typeof o!=='object')fail('CONNECTION_DESCRIPTOR');
  const direct=Object.getOwnPropertyDescriptor(o,k);
  if(direct){if(!Object.hasOwn(direct,'value'))fail('CONNECTION_DESCRIPTOR');
   if(k==='Connected'&&typeof direct.value!=='boolean'||k==='Session'&&(!direct.value||typeof direct.value!=='object'))fail('CONNECTION_CACHE');
   return direct.value;}
  const fields={UserName:['FUsername','function () { return this.FUsername; }'],Session:['FSession','function () { return this.FSession; }'],Connected:['FConnected','function () { return !!this.FConnected; }']};
  const proto=Object.getPrototypeOf(o),d=proto&&Object.getOwnPropertyDescriptor(proto,k),f=fields[k];
  if(!f||!d||Object.hasOwn(d,'value')||typeof d.get!=='function'
   ||Function.prototype.toString.call(d.get)!==f[1])fail('CONNECTION_DESCRIPTOR');
  const value=own(o,f[0]);
  if(k==='Connected'&&typeof value!=='boolean'||k==='Session'&&(!value||typeof value!=='object'))fail('CONNECTION_CACHE');
  return value;
 };
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const app=globalThis.bg?.app,p=globalThis.__loginomDockPreparationV1;
 if(!task||!Number.isSafeInteger(task.deadline)||Date.now()>=task.deadline||location.origin!==task.origin
  ||app?.Version!==task.build||p?.document!==document||p.id!==task.document_id)fail('DOCUMENT_OR_DEADLINE');
 const records=[...(p.receipts?.values()??[])].filter(r=>r.phase==='verified'&&r.workflowId===task.workflow_id);
 const prepared=records.find(r=>r.nodeTargetWorkflowNode),tabs=exact(task.tab_tid);
 if(!prepared||records.some(r=>r.tab!==prepared.tab||r.packageNode!==prepared.packageNode)
  ||tabs.length!==1||tabs[0]!==prepared.tab||!tabs[0].classList.contains('x-tab-active'))fail('WORKFLOW');
 const instance=app.Application?.FInstance,main=instance?.FMainForm;
 const workspace=main?.Items?.Workspace,card=workspace?.getActiveTab();
 const controller=card&&own(card,'Controller'),model=controller&&own(controller,'FController');
 const canonicalMap=main&&Object.getOwnPropertyDescriptor(main,'FMapTree');
 if(main&&'FMapTree' in main&&!canonicalMap)fail('MAP_DESCRIPTOR');
 if(canonicalMap&&!Object.hasOwn(canonicalMap,'value'))fail('MAP_DESCRIPTOR');
 // The prior own-data layout remains supported, but cannot replace an existing canonical map.
 const map=canonicalMap?canonicalMap.value:instance&&own(instance,'FMap'),connection=map&&own(map,'FServerConnection');
 if(connectionValue(connection,'Connected')!==true||typeof task.session_id!=='string'||!task.session_id||connectionValue(connection,'UserName')!==task.account)fail('ACCOUNT');
 const connectionShape=()=>['Connected','UserName','Session'].map(k=>{
  const direct=Object.getOwnPropertyDescriptor(connection,k),owner=direct?connection:Object.getPrototypeOf(connection);
  const d=direct??Object.getOwnPropertyDescriptor(owner,k);
  if(!d)fail('CONNECTION_DESCRIPTOR');
  return {owner,value:d.value,get:d.get,set:d.set,enumerable:d.enumerable,configurable:d.configurable,writable:d.writable};
 });
 const key='importPreconfigOpening' ,bytes=JSON.stringify(task),slot=Object.getOwnPropertyDescriptor(prepared,key);
 let r=slot?.value;
 if(slot&&!Object.hasOwn(slot,'value'))fail('SLOT_DESCRIPTOR');
 if(mode==='reserve') {
  if(slot)fail('NO_REPLAY');
  const diagram=model?.FDiagram,nodes=diagram?.FNodes?.FCollection,roots=exact(task.prefix+';ModelForm;cmpDiagram');
  if(!(model instanceof app.ModelForm)||!Array.isArray(nodes)||roots.length!==1||diagram.FmxGraph?.container!==roots[0])fail('GRAPH');
  const matches=nodes.filter(n=>n.FGuid===task.node_id);if(matches.length!==1)fail('NODE');
  const node=matches[0],nodeData=own(node,'data'),cell=own(node,'FCell'),body=diagram.FmxGraph.view.getState(cell)?.shape?.node;
  if(!body||!roots[0].contains(body)||!body.getAttribute('data-tid')?.startsWith(task.prefix+';Graph;'))fail('GRAPH_DOM');
  const groups=own(node,'FPorts');if(!Array.isArray(groups))fail('PORT_INVENTORY');
  const inventory=groups.map(group=>{const items=own(group,'FCollection');if(!Array.isArray(items))fail('PORT_GROUP');
   return {group,items,ports:items.map(port=>({port,data:own(port,'data'),parent:own(port,'parent'),
    index:Object.getOwnPropertyDescriptor(port,'FPortIndex'),guid:own(port,'FGuid')}))};});
  r={phase:'reserved',task:bytes,prepared,document,workspace,card,controller,main,canonicalMap:!!canonicalMap,map,connection,connectionShape:connectionShape(),session:connectionValue(connection,'Session'),
   account:connectionValue(connection,'UserName'),packageNode:prepared.packageNode,workflow:prepared.nodeTargetWorkflowNode,
   node,nodeData,cell,body,groups,inventory};
  Object.defineProperty(prepared,key,{value:r,enumerable:false,writable:false,configurable:false});
 }
 if(!r||r.prepared!==prepared||r.task!==bytes||r.document!==document||r.workspace!==workspace||r.map!==map
  ||r.connection!==connection||connectionValue(connection,'UserName')!==r.account||connectionValue(connection,'Session')!==r.session
  ||r.packageNode!==prepared.packageNode||r.workflow!==prepared.nodeTargetWorkflowNode)fail('ORIGINAL_SLOT');
 const inventory=()=>{
  if(own(r.node,'data')!==r.nodeData||own(r.node,'FGuid')!==task.node_id||own(r.node,'FCell')!==r.cell
   ||own(r.node,'FPorts')!==r.groups||r.groups.length!==r.inventory.length)fail('NODE_BINDING');
  for(const [i,g] of r.inventory.entries()) {
   if(r.groups[i]!==g.group||own(g.group,'FCollection')!==g.items||g.items.length!==g.ports.length)fail('PORT_GROUP_CHANGED');
   for(const [j,v] of g.ports.entries()) {
    const d=Object.getOwnPropertyDescriptor(v.port,'FPortIndex');
    if(g.items[j]!==v.port||own(v.port,'data')!==v.data||own(v.port,'parent')!==v.parent||v.parent!==r.node
     ||own(v.port,'FGuid')!==v.guid||!!d!==!!v.index||d&&(!Object.hasOwn(d,'value')||!Object.hasOwn(v.index,'value')||d.value!==v.index.value))fail('PORT_BINDING');
   }
  }
 };
 const wizard=()=>{
  const tree=own(own(own(controller,'Node'),'data'),'node'),nodeTree=tree&&own(tree,'ParentNode');
  const roots=exact(task.prefix+';WizrdMCF'),root=roots[0];
  if(!(tree instanceof app.WizardTreeNode)||!(nodeTree instanceof app.ModelNodeTreeNode)
   ||own(nodeTree,'ParentNode')!==r.workflow||own(nodeTree,'FGuid')!==task.node_id||own(nodeTree,'FModelNode')!==r.nodeData
   ||model?.constructor?.name!=='WizardModelComponentForm'||own(model,'FModelNode')!==r.nodeData
   ||roots.length!==1||own(own(own(model,'FView'),'el'),'dom')!==root)fail('WIZARD_BINDING');
  return {tree,nodeTree,root};
 };
 let w;
 if(mode!=='reserve') {
  w=wizard();
  if(mode==='complete') {
   if(r.phase!=='reserved')fail('NO_REPLAY');
   r.card=card;r.controller=controller;r.model=model;r.tree=w.tree;r.nodeTree=w.nodeTree;r.root=w.root;r.phase='completed';
  }
  if(r.phase!=='completed'||card!==r.card||controller!==r.controller||model!==r.model
   ||w.tree!==r.tree||w.nodeTree!==r.nodeTree||w.root!==r.root)fail('OPENING_CHANGED');
 }
 let observation;
 if(mode==='read') {
  const fields={},format={};
  const read=(form,key,dest,name)=>{const es=exact(task.prefix+';WizrdMCF;'+form+';'+key).filter(e=>r.root.contains(e));
   const inputs=es.length===1?[...es[0].querySelectorAll('input')]:[];
   dest[name]=inputs.length===1&&typeof inputs[0].value==='string'&&inputs[0].value.length<=2048
    ?{status:'observed_at_sample',value:inputs[0].value,representation:'cached_native_input_at_sample'}:{status:'unknown'};};
  read('ImportTextFilePreviewWizard','edtFileName;ValueControl',fields,'source_path');
  for(const [name,key] of Object.entries({delimiter:'edtDelimiterChar;ValueControl',text_qualifier:'edtTextQualifier;ValueControl',null_marker:'edtValueNull;ValueControl',decimal_separator:'edtDecimalSeparator;ValueControl'}))read('ImportTextFileParamsWizard',key,format,name);
  observation={revision:1,harness:'import-before-configure-v1',status:'PARTIAL',reason:'ORIGINAL_OPENING_IDENTITY_ONLY',
   complete:false,settings_applied:false,effect_possible:false,close_authority:false,
   document_id:task.document_id,session_id:task.session_id,account:r.account,
   sampled_at:Date.now(),current_native_verified:false,
   node:{node_id:task.node_id,workflow_id:task.workflow_id,component:'imports.text',native_owner_verified:false},
   source:fields,format,columns:{status:'unknown'},output0:{status:'unknown'},activity:{status:'unknown'},execution:{status:'unknown'},
   missing:['canonical_enum_types_kind','ordered_columns','output0_semantics','same_node_activity','execution_freshness','native_clean']};
  if(fields.source_path.status!=='observed_at_sample'||fields.source_path.value!==task.source_path) {
   observation.status='REFUSED';observation.reason='RETAINED_SOURCE_PATH_UNKNOWN_OR_DIFFERENT';
  }
 }
 // Finish provider reads first, then compare every retained sibling binding.
 const lastCard=workspace.getActiveTab();
 const finalTabs=exact(task.tab_tid),finalRoots=w?exact(task.prefix+';WizrdMCF'):null;
 if(app!==globalThis.bg?.app||app.Application?.FInstance!==instance||lastCard!==card||own(card,'Controller')!==controller||own(controller,'FController')!==model
  ||instance.FMainForm!==r.main||main.Items?.Workspace!==workspace
  ||!!Object.getOwnPropertyDescriptor(main,'FMapTree')!==r.canonicalMap
  ||(r.canonicalMap?own(main,'FMapTree'):own(instance,'FMap'))!==r.map
  ||finalTabs.length!==1||finalTabs[0]!==r.prepared.tab||w&&(finalRoots.length!==1||finalRoots[0]!==r.root)
  ||p!==globalThis.__loginomDockPreparationV1||p.document!==document||p.id!==task.document_id
  ||own(map,'FServerConnection')!==connection||connectionValue(connection,'Connected')!==true||connectionValue(connection,'UserName')!==r.account
  ||connectionValue(connection,'Session')!==r.session||Date.now()>=task.deadline)fail('CURRENT_OWNER');
 if(connectionShape().some((d,i)=>Object.keys(d).some(k=>d[k]!==r.connectionShape[i][k])))fail('FINAL_CONNECTION_BINDING');
 inventory();
 if(w&&(own(own(own(controller,'Node'),'data'),'node')!==r.tree||own(r.tree,'ParentNode')!==r.nodeTree
  ||own(r.nodeTree,'ParentNode')!==r.workflow||own(r.nodeTree,'FGuid')!==task.node_id||own(r.nodeTree,'FModelNode')!==r.nodeData||own(model,'FModelNode')!==r.nodeData
  ||own(own(own(model,'FView'),'el'),'dom')!==r.root))fail('FINAL_WIZARD_BINDING');
 return observation??{status:mode==='reserve'?'reserved':'completed',receipt_id:task.receipt_id,
  document_id:task.document_id,workflow_id:task.workflow_id,node_id:task.node_id,account:r.account,
  deadline:task.deadline,settings_applied:false,opening_effect:true};
}
