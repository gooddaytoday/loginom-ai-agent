import {captureJavascriptNativeZero} from './javascript-native-zero.mjs';
export function javascriptNativeRoundtripSnapshot(b,zeroCapture){
  const v=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value;
  const need=(x,m)=>{if(!x)throw Error('Native input binding: '+m);};
  const cookieClass=v(v(bg,'rpc'),'TIBGDelegateConnectionCookie_Proxy');
  const cookiePrototype=v(cookieClass,'prototype'),cookieInterface=v(cookiePrototype,'$II');
  const cookie=(value,kind)=>{
    const check=(ok,reason,depth,count)=>{
      if(ok)return;
      // Diagnostic only: no cookie/session values or unrestricted property names.
      // Three '$' levels distinguish Out -> proxy -> remote identity without
      // following $S into session internals. Keep the production 500-char cap.
      const className=o=>{
        if(!o||typeof o!=='object')return o===null?'null':typeof o;
        const name=v(v(Object.getPrototypeOf(o),'constructor'),'name');
        const names={Object:'Object',Out:'Out',DelegateCookie:'DelegateCookie',
          $bg_rpc_TIBGDelegateConnectionCookie_Proxy:'DelegateProxy',$rpc_TBGObjectProxy:'ObjectProxy'};
        return Object.hasOwn(names,name)?names[name]:'other';
      };
      const shape=o=>{
        const fields=['value','$','$S','$FRefCount','$OW','$O','$I','$RRC'];
        const mask=fields.map(k=>{
          const d=Object.getOwnPropertyDescriptor(o??{},k);
          if(!d)return '-';if(!('value' in d))return 'a';
          return d.value===null?'0':({undefined:'u',object:'o',number:'n',string:'s',boolean:'b',function:'f',bigint:'i',symbol:'y'}[typeof d.value]??'?');
        }).join('');
        const count=o&&typeof o==='object'?Reflect.ownKeys(o).length:0;
        return [className(o),mask,count>16?'>16':String(count)];
      };
      const chain=o=>[shape(o),shape(v(o,'$')),shape(v(v(o,'$'),'$'))];
      need(false,'NC1 '+JSON.stringify({k:kind,r:reason,z:depth,n:count===undefined?'-':count>16?'>16':String(count),h:className(helper),
        d:chain(v(helper,'$FDataChangeCookie')),s:chain(v(helper,'$FStateChangeCookie'))}));
    };
    check(typeof cookieClass==='function'&&typeof cookieInterface==='function'
      &&v(cookiePrototype,'constructor')===cookieClass&&value&&typeof value==='object'
      &&Object.getPrototypeOf(value)===cookiePrototype,'class',0);
    const exact=(o,keys)=>o&&typeof o==='object'&&Reflect.ownKeys(o).length===keys.length
      &&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(o,k)??{},'value'));
    check(exact(value,['$','$S','$FRefCount']),'fields',0);
    check(v(value,'$S')===v(ds,'$S'),'session',0);
    const identity=v(value,'$');
    check(exact(identity,['$OW','$O','$I','$RRC'])&&Object.getPrototypeOf(identity)===Object.prototype,'identity',1);
    const int32=x=>Number.isInteger(x)&&!Object.is(x,-0)&&x>=-2147483648&&x<=2147483647;
    const owner=v(identity,'$OW'),object=v(identity,'$O'),type=v(identity,'$I'),remoteRefs=v(identity,'$RRC'),refs=v(value,'$FRefCount');
    check(int32(owner)&&owner>=0&&int32(object)&&type===206
      &&int32(remoteRefs)&&remoteRefs>=0&&int32(refs)&&refs>=0,'scalars',1);
    // Subscription metadata, not a data-generation/version counter. Never walk $S.
    return {identity,identityPrototype:Object.getPrototypeOf(identity),value:JSON.stringify([owner,object,type,remoteRefs,refs])};
  };
  const fixtureId=b.fixture_id??'real',slice={real:[4,3],boolean:[3,1],string:[8,5],'integer-safe':[4,4],'integer-outside-safe':[3,4],'civil-datetime':[3,2],'cardinality-keep2':[3,4,1],'cardinality-odd':[3,4,2],'cardinality-duplicate':[3,4,6],'cardinality-empty':[3,4,0]}[fixtureId];
  const rowCount=b.roundtrip_role==='output'?(slice?.[2]??slice?.[0]):slice?.[0];
  need(Array.isArray(slice)&&b.rows===rowCount&&b.row_count===rowCount
    &&JSON.stringify(b.schema)===JSON.stringify([{name:'Value',label:'Value',type:slice[1]}]),'fixed native fixture schema/count');
  const prep=globalThis.__loginomDockPreparationV1;
  need(prep?.document===document&&prep.id===b.document_id&&location.origin===b.origin&&bg.app.Version==='7.4.2','document/build');
  const receipts=[...prep.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===b.workflow_id&&r.nodeTargetWorkflowNode);
  need(receipts.length===1,'unique workflow receipt');const receipt=receipts[0];
  need(receipt.tab===document.querySelector('[data-tid='+JSON.stringify(b.tab_tid)+']')&&receipt.tab.classList.contains('x-tab-active'),'workflow tab');
  const card=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),model=card.Controller.FController;
  let treeNode=card.Controller.Node?.data?.node,workflow,pack;
  for(let i=0;treeNode&&i<32;i++,treeNode=treeNode.ParentNode){
    if(treeNode instanceof bg.app.WorkFlowTreeNode)workflow=treeNode;
    if(treeNode instanceof bg.app.PackageTreeNode){pack=treeNode;break;}
  }
  need(workflow===receipt.nodeTargetWorkflowNode&&pack===receipt.packageNode,'workflow/package owner');
  const diagram=model.FDiagram,nodes=diagram.FNodes.FCollection,links=diagram.FLinks.FCollection;
  const roundtrip=globalThis.__loginomJavascriptNativeRoundtripV1;
  need(roundtrip?.document===document&&roundtrip.input.fixtureId===fixtureId&&roundtrip.stage==='completed'&&roundtrip.source_sha256===b.source_sha256,'roundtrip capability');
  roundtrip.check();
  const completed=b.roundtrip_role==='output'?roundtrip.execution:roundtrip.binding.completed_child;
  need(b.execution.execution_id===(b.roundtrip_role==='output'?roundtrip.execution.execution_id:roundtrip.binding.execution.execution_id)
    &&['group_id','process_id','process_record_id'].every(k=>b.completed_child[k]===completed[k]),'role execution differs');
  need(['output','upstream'].includes(b.roundtrip_role),'roundtrip role');
  const node=b.roundtrip_role==='output'?roundtrip.node:roundtrip.input.node;
  need(nodes.includes(node)&&node.FGuid===b.node_id&&node.FStatus===1&&node.FRunning===false,'selected completed node');
  need(model.FCreateDraggedNodeStarted===false&&model.FDraggingOverGraph===false&&!model.FDraggedNode,'graph interaction');
  const manager=v(model,'FPreviewManager'),form=v(manager,'FPreviewForm'),port=v(form,'FCurrentPreviewPort');
  const nodePorts=v(node,'FPorts'),inputCollection=v(nodePorts,0),inputPorts=v(inputCollection,'FCollection');
  // Probe05: exactly Connection(6), Variables(3), both input0/param1/status1.
  // The input-only topology guard above separately rejects every graph link.
  const jsOutputs=roundtrip.node.FPorts?.[1]?.FCollection,addPortClass=globalThis.mx?.AddPort;
  const addPortPrototype=addPortClass?.prototype,addService=jsOutputs?.[1];
  const undefinedData=key=>{const d=Object.getOwnPropertyDescriptor(addService??{},key);return !!d&&Object.hasOwn(d,'value')&&d.value===undefined;};
  const serviceValid=Array.isArray(jsOutputs)&&jsOutputs.length===2&&typeof addPortClass==='function'
    &&addPortPrototype?.constructor===addPortClass&&addService&&Object.getPrototypeOf(addService)===addPortPrototype
    &&addService.parent===roundtrip.node&&v(addService,'FType')===1&&v(addService,'FSubType')===10
    &&v(addService,'FStatus')===0&&undefinedData('FParam')&&undefinedData('FPortIndex');
  need(serviceValid,'exact JS AddPort service layout');
  const previewChecks={
    visible:v(manager,'FPreviewVisible')===true,
    node:v(form,'FCurrentPreviewNode')===node,
    parent:port?.parent===node,
    guid:port?.FGuid===b.port_guid,
    outputs:b.roundtrip_role==='output'?jsOutputs.length===2:node.FPorts?.[1]?.FCollection?.length===1,
    output:node.FPorts?.[1]?.FCollection?.[0]===port&&!!port,
    inputs:Array.isArray(nodePorts)&&nodePorts.length===2&&Array.isArray(inputPorts)
      &&(b.roundtrip_role==='upstream'
        ?inputPorts.length===2&&[6,3].every((subtype,i)=>inputPorts[i]?.parent===node&&v(inputPorts[i],'FType')===0
          &&v(inputPorts[i],'FSubType')===subtype&&v(inputPorts[i],'FParam')===1&&v(inputPorts[i],'FStatus')===1)
        :inputPorts.includes(roundtrip.targetPort)&&roundtrip.targetPort.parent===node),
    type:port?.FType===1,
    subtype:port?.FSubType===1,
    param:port?.FParam===(b.roundtrip_role==='output'?2:0),
    index:b.roundtrip_role!=='output'||port?.FPortIndex===0,
    status:port?.FStatus===1,
    last_node:manager?.FShowDataLastCall?.Node===node,
    last_port:manager?.FShowDataLastCall?.Port===port&&!!port
  };
  if(!Object.values(previewChecks).every(Boolean)){
    const inputs=inputPorts;
    const enumValue=x=>x===undefined?'missing':Number.isInteger(x)&&x>=0&&x<=16?String(x):'other';
    // NI1 inventory comes first. Port tuples are [parentMatches,type,subtype,param,status].
    // Short failed-check names keep even every failure below the 500-char transport cap.
    const diagnostic={n:!Array.isArray(inputs)?'invalid':inputs.length<=4?String(inputs.length):'>4',
      i:Array.isArray(inputs)?inputs.slice(0,4).map(p=>[p?.parent===node,
        enumValue(v(p,'FType')),enumValue(v(p,'FSubType')),enumValue(v(p,'FParam')),enumValue(v(p,'FStatus'))]):[],
      o:enumValue(v(port,'FParam')),f:Object.keys(previewChecks).filter(k=>!previewChecks[k])};
    need(false,'NI1 '+JSON.stringify(diagnostic));
  }
  const tree=document.querySelector('[data-tid="ConsoleForm;ProgressForm;trpProgress;treepanel;tree"]');need(tree,'process tree');
  const processStore=Ext.getCmp(tree.id).getStore(),processRoot=processStore.getRoot();
  need(!processStore.isLoading()&&processRoot.data.loaded===true,'loaded process root');
  const parts=b.execution.execution_id.slice(b.document_id.length+1).split(':');
  need(b.execution.status==='completed'&&b.execution.execution_id.startsWith(b.document_id+':')&&parts.length===2
    &&String(processRoot.internalId)===parts[0]&&b.completed_child.group_id===parts[1],'execution root/group');
  const records=[],parents=new Map();const walk=(ns,parent)=>{need(records.length+ns.length<=2000,'process bound');for(const r of ns){need(!r.data.loading&&!parents.has(r),'process loading/cycle');parents.set(r,parent);records.push(r);walk(r.childNodes??[],r);}};walk(processRoot.childNodes,processRoot);
  const groups=records.filter(r=>String(r.data.id)===parts[1]);
  need(groups.length===1&&groups[0].data.Status===3&&groups[0].data.ErrorDetails===''&&groups[0].data.loaded===true,'completed group');
  const children=records.filter(r=>r.data.ModelNode===node.data);
  const child=children.filter(r=>String(r.data.id)===b.completed_child.process_id&&String(r.internalId)===b.completed_child.process_record_id);
  need(child.length===1&&child[0].data.Status===3&&child[0].data.ErrorDetails===''
    &&String(child[0].data.id).startsWith(parts[1]+'.')
    &&!children.some(r=>Number(String(r.data.id).split('.')[0])>Number(parts[1])),'latest owned import child');
  let ancestor=parents.get(child[0]);while(ancestor&&ancestor!==groups[0])ancestor=parents.get(ancestor);
  need(ancestor===groups[0]&&parents.get(groups[0])===processRoot,'owned process hierarchy');
  const root=document.querySelector('[data-tid='+JSON.stringify(b.prefix+';ModelForm;PreviewWindow;PreviewForm;DataSetForm')+']');
  need(root?.checkVisibility({checkVisibilityCSS:true}),'visible native dataset');
  const dc=v(Ext.getCmp(root.id),'Controller'),dt=v(dc,'FDataTable'),ds=v(dc,'FDataSource'),store=v(dt,'FDataSourceStore');
  const helper=v(ds,'$FHelper'),identity=v(ds,'$');
  need(dc.FModelNode===node.data&&ds===v(dt,'FDataSource')&&v(v(store,'proxy'),'dataSource')===ds
    &&v(helper,'FBaseProxy')===ds&&v(ds,'$S')===node.data.$S,'datasource identity');
  need(v(identity,'$I')===116&&Number.isInteger(v(identity,'$OW'))&&v(identity,'$OW')>=0&&Number.isInteger(v(identity,'$O')),'interface116');
  if(b.source)need(v(identity,'$OW')===b.source.owner&&v(identity,'$O')===b.source.object,'remote source replaced');
  const zero=fixtureId==='cardinality-empty'&&b.roundtrip_role==='output';
  if(!zero)need(!store.loading&&v(helper,'$FCacheInitialized')===true&&v(helper,'$FData'),'loaded cache');
  const fields=v(v(v(dc,'FColumnInfosStore'),'data'),'items');
  need(Array.isArray(fields)&&fields.length===1,'one field');const field=v(fields[0],'data');
  need(v(field,'Name')==='Value'&&v(field,'DisplayName')==='Value'&&v(field,'DataType')===slice[1],'fixed native schema');
  need(v(dt,'FTotalRowCount')===rowCount&&v(helper,'$FRowCount')===rowCount,'fixed native row count');
  const runtime=globalThis.__loginomJavascriptNativeRuntimeV1;
  need(runtime?.document===document&&runtime.binding_id===b.runtime_binding_id,'loaded runtime binding');runtime.check(v(ds,'$S'));
  const dataCookie=v(helper,'$FDataChangeCookie'),stateCookie=v(helper,'$FStateChangeCookie');
  const cookieState=(key,kind)=>{
    const descriptor=Object.getOwnPropertyDescriptor(helper,key),observed=descriptor?.value;
    need(!descriptor||Object.hasOwn(descriptor,'value'),'subscription accessor');
    if(zero&&observed==null)return {identity:null,identityPrototype:null,value:descriptor?observed===null?'null':'undefined':'missing'};
    return cookie(observed,kind);
  };
  const dataCookieState=cookieState('$FDataChangeCookie','d'),stateCookieState=cookieState('$FStateChangeCookie','s');
  const declaration=roundtrip.schemaWitness.declaration,declaration_sha256=roundtrip.schemaWitness.declaration_sha256;
  const zeroState=zero?zeroCapture({dc,dt,ds,store,helper,fields,field,declaration,declaration_sha256}):{};
  if(b.roundtrip_role==='upstream')need(ds===roundtrip.input.ds&&helper===roundtrip.input.helper&&v(helper,'$FData')===roundtrip.input.cache&&fields===roundtrip.input.fields&&field===roundtrip.input.field,'upstream datasource/cache replaced');
  return {...zeroState,declaration,declaration_sha256,addPortClass,addPortPrototype,addService,roundtrip,prep,receipt,card,model,diagram,nodes,links,node,nodeData:node.data,port,portData:port.data,manager,form,workflow,pack,fields,field,
    cookieClass,cookiePrototype,cookieInterface,
    nodePorts,inputCollection,inputPorts,connectionInput:inputPorts[0],variablesInput:inputPorts[1],
    processStore,processRoot,group:groups[0],child:child[0],
    processFingerprint:JSON.stringify(records.map(r=>[r.internalId,r.data.id,parents.get(r)?.internalId,r.data.Status,r.data.ErrorDetails,r.data.ModelNode===node.data])),
    root,dc,dt,ds,store,helper,identity,fixtureId,typeCode:slice[1],count:rowCount,cache:v(helper,'$FData'),owner:v(identity,'$OW'),object:v(identity,'$O'),
    dataCookie,stateCookie,dataCookieIdentity:dataCookieState.identity,stateCookieIdentity:stateCookieState.identity,
    dataCookieIdentityPrototype:dataCookieState.identityPrototype,stateCookieIdentityPrototype:stateCookieState.identityPrototype,
    dataCookieValue:dataCookieState.value,stateCookieValue:stateCookieState.value};
}

export async function bindJavascriptNativeRoundtrip(page,args,snapshot,zeroSnapshot){
  return page.evaluate(({args,code,zeroCode})=>{
    const state=globalThis.__loginomJavascriptNativeRoundtripV1;
    if(!state||state.bindings.has(args.roundtrip_role))throw Error('Roundtrip role already reserved; no replay');
    if(!['output','upstream'].includes(args.roundtrip_role))throw Error('Unknown roundtrip role');
    if(args.roundtrip_role==='upstream'){
      const output=state.bindings.get('output'),read=globalThis.__loginomJavascriptNativeRoundtripReadV1;
      if(!output||output.initial.zeroFacts&&!output.zeroGraphVerified||read?.document!==document||read.poisoned||read.active||read.last?.id!==output.readId
        ||read.last.status!=='completed'||!read.last.published||read.last.pending!==0
        ||read.last.requests!==output.initial.count||read.last.releasedRequests!==output.initial.count||read.last.releasedResponses!==output.initial.count)throw Error('Completed output read required before upstream');
    }
    state.bindings.set(args.roundtrip_role,null);
    const base=eval('('+code+')'),zero=eval('('+zeroCode+')'),capture=b=>base(b,zero),initial=capture(args);
    const zeroCheck=()=>{
      state.check();
      if(initial.manager.FPreviewVisible!==false)throw Error('Original graph after zero Preview Close required');
      const v=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value;
      if(v(initial.dc,'FModelNode')!==initial.nodeData||v(initial.ds,'$S')!==initial.nodeData.$S||v(initial.dc,'FDataSource')!==initial.ds||v(initial.dc,'FDataTable')!==initial.dt||v(initial.dt,'FDataSource')!==initial.ds
        ||v(initial.dt,'FDataSourceStore')!==initial.store||v(initial.zeroProxy,'dataSource')!==initial.ds
        ||v(initial.ds,'$FHelper')!==initial.helper||v(initial.helper,'FBaseProxy')!==initial.ds||v(initial.ds,'$')!==initial.identity
        ||v(initial.identity,'$OW')!==initial.owner||v(initial.identity,'$O')!==initial.object||v(initial.identity,'$I')!==116
        ||v(v(v(initial.dc,'FColumnInfosStore'),'data'),'items')!==initial.fields)throw Error('Zero datasource changed after graph return');
      for(const [key,cookie,identity,tuple,prototype]of [['$FDataChangeCookie',initial.dataCookie,initial.dataCookieIdentity,initial.dataCookieValue,initial.dataCookieIdentityPrototype],['$FStateChangeCookie',initial.stateCookie,initial.stateCookieIdentity,initial.stateCookieValue,initial.stateCookieIdentityPrototype]]){
        const d=Object.getOwnPropertyDescriptor(initial.helper,key),c=d?.value;
        if(d&&!Object.hasOwn(d,'value')||c!==cookie)throw Error('Zero subscription changed after graph return');
        const current=c==null?(d?c===null?'null':'undefined':'missing'):JSON.stringify([v(v(c,'$'),'$OW'),v(v(c,'$'),'$O'),v(v(c,'$'),'$I'),v(v(c,'$'),'$RRC'),v(c,'$FRefCount')]);
        if(current!==tuple||c!=null&&(v(c,'$')!==identity||Object.getPrototypeOf(identity)!==prototype||Reflect.ownKeys(identity).length!==4||Reflect.ownKeys(c).length!==3||Object.getPrototypeOf(c)!==initial.cookiePrototype||v(c,'$S')!==v(initial.ds,'$S')))throw Error('Zero cookie identity changed after graph return');
      }
      const current=zero(initial);
      if(!Object.keys(current).every(k=>current[k]===initial[k]))throw Error('Zero held cache/metadata changed after graph return');
      return JSON.parse(current.zeroFacts);
    };
    const zeroAcknowledge=receipt=>{
      if(receipt?.phase!=='javascript_native_zero_graph_verified'||receipt.read_id!==args.binding_id
        ||receipt.declaration_sha256!==initial.declaration_sha256||JSON.stringify(receipt.facts)!==JSON.stringify(zeroCheck()))throw Error('Zero graph acknowledgement differs');
      state.bindings.get('output').zeroGraphVerified=true;
    };
    state.bindings.set(args.roundtrip_role,{document,id:args.runtime_binding_id,readId:args.binding_id,initial,capture,...(initial.zeroFacts?{zeroCheck,zeroAcknowledge}:{})});
    return {...args,source:{owner:initial.owner,object:initial.object},schema_mode:state.schema_mode,javascript_node_id:state.node.FGuid,
      ...(state.fixture_id==='cardinality-empty'?{declaration:initial.declaration,declaration_sha256:initial.declaration_sha256,done_witness:state.done}:{}),
      ...(initial.zeroFacts?{subscriptions:{data:initial.dataCookieValue,state:initial.stateCookieValue}}:{}),
      add_port_sources:{constructor:Function.prototype.toString.call(initial.addPortClass)},
      cookie_sources:{constructor:Function.prototype.toString.call(initial.cookieClass),interface:Function.prototype.toString.call(initial.cookieInterface)},
      count_loader_sources:{PrepareColumnInfoAndRowCount:initial.dc.PrepareColumnInfoAndRowCount.toString(),
        InitOutput:initial.dc.InitOutput.toString(),DataSourceProxyRead:initial.store.proxy.read.toString()}};
  },{args,code:snapshot.toString(),zeroCode:zeroSnapshot.toString()});
}
export function javascriptNativeRoundtripCode(args){
  return `async page=>(${bindJavascriptNativeRoundtrip.toString()})(page,${JSON.stringify(args)},${javascriptNativeRoundtripSnapshot.toString()},${captureJavascriptNativeZero.toString()})`;
}
