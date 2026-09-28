import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {inputProof} from './javascript-native-named.test.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {javascriptNamedCase,javascriptNamedProbe} from './javascript-native-named-cases.mjs';
import {verifyJavascriptNamedInput,verifyJavascriptNamedOutcome} from './javascript-native-named-contract.mjs';
import {verifyNativeRoundtripExecution} from './javascript-native-roundtrip-contract.mjs';
import {completeJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
import {createHash} from 'node:crypto';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {collectJavascriptMetadataSources,verifyJavascriptMetadataSources,captureJavascriptNativeMetadata,createJavascriptMetadataLifecycle,requireJavascriptMetadataMode,runJavascriptNativeMetadata} from './javascript-native-metadata.mjs';
import {readJavascriptNativeRoundtrip} from './javascript-native-roundtrip-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';

// Retained Loginom PropertySelector, unchanged bytes. Only GetPropertyValues is a
// synthetic server; production selectRange/SetPropValues/finally/cast lifetimes run.
const selectorSource=readFileSync(new URL('./fixtures/javascript-property-selector-reviewed.js',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(selectorSource).digest('hex'),'f630266cafcbb6559e6a7f521ff9e6c807b88be13e18e0d546e939c8f14c7b55');
const reviewedFunctions=JSON.parse(readFileSync(new URL('./fixtures/javascript-metadata-reviewed-functions.json',import.meta.url),'utf8'));
assert.deepEqual(verifyJavascriptMetadataSources(reviewedFunctions.sources),reviewedFunctions.sha256);
export async function metadataFixture({hook,namedCaseId='C-set-index',unbound=false,reply}={}){
  const x=await roundtrip({fixtureId:'integer-safe',namedCaseId,deferCompletion:unbound,reply,beforeGraph:({f,js,output})=>{js.data.$={$OW:0,$O:90,$I:1069};output.data={$S:f.session,$:{$OW:0,$O:91,$I:1081}};}});
  const b=unbound?undefined:await x.bind('output'),env=x.f.env,values=new Map(),calls=[];
  if(unbound){
    const f=x.f;f.dt.FTotalRowCount=1;f.model.FPreviewManager.FPreviewVisible=true;
    Object.assign(f.model.FPreviewManager.FPreviewForm,{FCurrentPreviewNode:x.js,FCurrentPreviewPort:x.output});
    Object.assign(f.model.FPreviewManager.FShowDataLastCall,{Node:x.js,Port:x.output});
    f.dc.FModelNode=x.js.data;f.dc.FDataSource=x.outputDs;f.dt.FDataSource=x.outputDs;f.store.proxy.dataSource=x.outputDs;
  }
  let next=100,originalReads=0;
  function make(data={},iface=87,existing){
    function Native(){}
    const object=existing??Object.create(Native.prototype);
    Object.defineProperty(object,'constructor',{value:Native,configurable:true});
    if(!object.$)object.$={$OW:0,$O:next++,$I:iface};
    object.$S=x.f.session;
    Native.schema={};values.set(object,{...data});
    for(const name of Object.keys(data))Object.defineProperty(Native.prototype,name,name==='Items'
      ?{value:()=>{originalReads++;throw Error('original Items RPC fallback');},configurable:true}
      :{get(){originalReads++;throw Error('unselected property '+name);},configurable:true});
    return object;
  }
  const socket=make({},961),component=make({},780),engine=make({},781),ports=make({},815),parent=make({},1086),modelPorts=make({},1082);
  const n=make({},1069,x.js.data),w=make({},1081,x.output.data);
  const s=make({},102),t=make({},84),p=make({},860),item=make({},814),output=make({},219);
  const source=make({},87),target=make({},69),extension=make({},81),extensions=make({},0);
  const d=x.outputDs;
  make({},116,d);
  values.set(n,{OutputPorts:modelPorts,Component:component});values.set(w,{Index:0,Parent:parent,Socket:socket});
  values.set(parent,{ParentNode:n});values.set(modelPorts,{Count:1,Items:[w]});values.set(component,{Engine:engine});values.set(engine,{OutputPorts:ports});
  values.set(ports,{Count:1,Items:[item]});values.set(item,{Index:0,Port:p});
  values.set(p,{SourceColumns:s,TargetColumns:t,Socket:socket});values.set(socket,{Output:output});
  values.set(output,{SyncThroughColumns:true,ColumnDefs:t});values.set(d,{ColumnDefs:t});
  values.set(s,{Count:1,Items:[source]});values.set(t,{Count:1,Items:[target]});
  values.set(source,{ID:1,Index:0,Name:'Value',DisplayName:'Value',DataType:4,Collection:s});
  values.set(target,{ID:2,Index:0,Name:'Value',DisplayName:'Value',DataType:4,Collection:t,Extensions:extensions});
  values.set(extension,{Source:source,SourceIndex:0});
  const types={IBGColumnsMappingEngineOutputPort:function MappingPort(){},IBGCustomDerivedDataSource:function Derived(){},IBGColumnDefMappingExtension:function MappingExtension(){}};
  for(const type of Object.values(types))type.__interface=true;
  const casts=new Map([[p,new Map([[types.IBGColumnsMappingEngineOutputPort,p]])],[output,new Map([[types.IBGCustomDerivedDataSource,output]])],[extensions,new Map([[types.IBGColumnDefMappingExtension,extension]])]]);
  function dict(type){return type.schema;}
  function desc(source,type,selector){
    const selected=dict(type??source.ReturnType??source),items=selector(selected);
    return items.map(item=>item===selected?{GetterMethodIndex:-1}:item instanceof Member?{GetterMethodIndex:item.GetterMethodIndex,MemberInfo:item}:item);
  }
  function Member(name,type){this.Name=name;this.ReturnType=type;this.Kind=name==='Items'?1:0;this.GetterMethodIndex=42;}
  for(const [object,data]of values){
    object.constructor.schema={__IsSelectorDict:true};
    for(const [name,value]of Object.entries(data)){
      const type=name==='Items'?value[0]?.constructor:values.has(value)?value.constructor:String;
      object.constructor.schema[name]=new Member(name,type);
      if(!Object.getOwnPropertyDescriptor(object.constructor.prototype,name))Object.defineProperty(object.constructor.prototype,name,name==='Items'
        ?{value:()=>{originalReads++;throw Error('original Items fallback');},configurable:true}
        :{get(){originalReads++;throw Error('unselected property '+name);},configurable:true});
    }
  }
  types.IBGColumnsMappingEngineOutputPort.schema=p.constructor.schema;
  types.IBGCustomDerivedDataSource.schema=output.constructor.schema;
  types.IBGColumnDefMappingExtension.schema=extension.constructor.schema;
  const query=(object,descs)=>descs.map(prop=>{
    const data=values.get(object);
    if(prop.GetterMethodIndex===-1)return {Value:object};
    if(prop.GetterMethodIndex===-4)return {Elements:query(data[prop.MemberInfo.Name],prop.Elements)};
    if(prop.GetterMethodIndex===-5){const cast=casts.get(object)?.get(prop.InterfaceType);return {Elements:cast?query(cast,prop.Elements):null};}
    if(prop.GetterMethodIndex===-3){
      assert.equal(prop.RangeStartIndex,0);assert.equal(prop.RangeEndIndex,1);
      return {TotalCount:data.Count,RangeStartIndex:0,Items:data.Items.slice(0,1).map(v=>({Elements:query(v,prop.Elements)}))};
    }
    assert.ok(prop.GetterMethodIndex>=0,'no selectAll');return {Value:data[prop.MemberInfo.Name]};
  });
  const rpc={TBGSession:{
    SelectPropertyDescs:(type,selector)=>desc(type,type,selector),
    SelectInterfacePropertyDesc(member,selector,type,safe){
      const elements=desc(member,type,selector);
      return {GetterMethodIndex:-4,MemberInfo:member,Elements:type?[{GetterMethodIndex:-5,InterfaceType:type,IgnoreIntfCastError:safe,Elements:elements}]:elements};
    },
    SelectIntfCastPropertyDesc:(type,selector,safe)=>({GetterMethodIndex:-5,InterfaceType:type,IgnoreIntfCastError:safe,Elements:desc(type,type,selector)}),
    SelectListRangePropertyDesc(type,start,end,selector){return this.SelectItemRangePropertyDesc(type.schema.Items,type.schema.Count,start,end,selector);},
    SelectItemRangePropertyDesc(item,count,start,end,selector){return {GetterMethodIndex:-3,ItemMemberInfo:item,CountMemberInfo:count,RangeStartIndex:start,RangeEndIndex:end,Elements:desc(item,undefined,selector)};},
    async GetPropertyValues$1(object,descs){calls.push({object,descs});await hook?.({call:calls.length,x,values,refs,casts});return query(object,descs);}
  }};
  const refs={n,w,s,t,p,d,source,target,extension,extensions,socket,component,engine,ports,item,output,parent,modelPorts};
  Object.assign(env,{NamesOf:()=>({QueryInterface:'QueryInterface'}),rpc,rtl:{SelectorMemberInfo:Member},IInterface:function IInterface(){},Debug:{assert:value=>assert.ok(value)},ss:{isNullOrUndefined:x=>x==null,isInterface:t=>t?.__interface,getInterfaces:t=>[],getBaseType:t=>Object},
    __awaiter:(_this,_args,_P,generator)=>new Promise((resolve,reject)=>{const g=generator.apply(_this,_args??[]);const next=(method,arg)=>{let v;try{v=g[method](arg);}catch(e){reject(e);return;}if(v.done)resolve(v.value);else Promise.resolve(v.value).then(v=>next('next',v),e=>next('throw',e));};next('next');})});
  Object.assign(env.bg,types,{CreateDictionary:()=>({}),IsDisposedProxyObject:()=>false});
  // Loading the retained selector defines normal bg/rpc APIs, not replacement production capability code.
  await x.f.page.evaluate(text=>{(0,eval)(text);rpc.$imp.InterceptPropertiesDebugEnabled=false;},selectorSource);
  // Exact S17 public bodies for reflection. Dispatcher lexical transport is the
  // synthetic boundary; the real $1 state machine is defined but NOT executed.
  const transport={GetPropertyValues$1:rpc.TBGSession.GetPropertyValues$1};
  rpc.TBGSession.GetPropertyValues=Function('$rpc_TBGSession','ss','return ('+reviewedFunctions.sources.getPropertyValues+')')(transport,env.ss);
  rpc.TBGSession.GetPropertyValues$1=Function('return ('+reviewedFunctions.sources.getPropertyValuesImpl+')')();
  if(b){b.metadata_function_sources=reviewedFunctions.sources;b.metadata_function_sha256=verifyJavascriptMetadataSources(b.metadata_function_sources);}
  const state=()=>env.__loginomJavascriptNativeRoundtripV1.metadata;
  return {x,b,refs,values,calls,casts,state,originalReads:()=>originalReads,run:async()=>{if(!env.__loginomJavascriptNativeRoundtripV1.metadataAttestation&&!state())await x.f.page.evaluate(collectJavascriptMetadataSources,b);return x.f.page.evaluate(captureJavascriptNativeMetadata,b);}};
}

test('metadata actual selector scopes: seven bounded calls, native associations, no lazy getters',async()=>{
  const f=await metadataFixture(),dto=await f.run();
  assert.equal(dto.metadata_observation_complete,true);assert.equal(dto.api_calls,7);assert.equal(dto.D_case_complete,false);
  assert.equal(dto.G5_complete,false);assert.equal(dto.wire_request_count_verified,false);assert.ok(dto.held_objects<=32);
  assert.equal(dto.mapping.source.object,dto.source.identity.object);assert.equal(dto.target.identity.object,dto.physical.identity.object);
  assert.notEqual(dto.model_output_membership.parent_collection.object,dto.model_output_membership.output_collection.object);
  assert.equal(dto.model_output_membership.parent_collection.interface,1086);assert.equal(dto.model_output_membership.output_collection.interface,1082);
  assert.equal(dto.model_output_membership.port.object,dto.owner.port.object);assert.equal(dto.model_output_membership.count,1);assert.equal(dto.model_output_membership.index,0);
  assert.equal(f.originalReads(),0);assert.equal(f.calls.length,7);assert.equal(f.state().pending,0);
  assert.equal(Object.hasOwn(f.refs.source,'Name'),false);assert.equal(Object.hasOwn(f.refs.ports,'Items'),false);
  assert.equal(Object.hasOwn(f.refs.extensions,'QueryInterface'),false);
  assert.throws(()=>f.refs.source.Name,/unselected/);
  assert.equal(dto.source.name,'Value');await assert.rejects(f.run,/no metadata replay/);
});

for(const [name,call,change]of [
  ['model output count zero',1,({values,refs})=>values.get(refs.modelPorts).Count=0],
  ['model output count two',1,({values,refs})=>values.get(refs.modelPorts).Count=2],
  ['model output membership index',1,({values,refs})=>{values.get(refs.modelPorts).Items=[refs.item];values.get(refs.item).Index=1;}],
  ['foreign parent node',1,({values,refs})=>{const n={...refs.n,$:{...refs.n.$,$O:991}};values.set(n,values.get(refs.n));values.get(refs.parent).ParentNode=n;}],
  ['socket',2,({values,refs})=>values.get(refs.p).Socket=refs.output],
  ['engine count',1,({values,refs})=>values.get(refs.ports).Count=2],
  ['range count drift',2,({values,refs})=>values.get(refs.ports).Count=2],
  ['mapping source',6,({values,refs})=>values.get(refs.extension).Source=refs.target],
  ['source index',6,({values,refs})=>values.get(refs.extension).SourceIndex=1],
  ['physical collection',4,({values,refs})=>values.get(refs.d).ColumnDefs=refs.s],
  ['field collection',5,({values,refs})=>values.get(refs.source).Collection=refs.t],
  ['field type',5,({values,refs})=>values.get(refs.source).DataType=5],
  ['field name bound',5,({values,refs})=>values.get(refs.source).Name='x'.repeat(129)],
  ['malformed display name',5,({values,refs})=>values.get(refs.source).DisplayName={}],
  ['source metadata drift',6,({values,refs})=>values.get(refs.source).Name='Changed'],
  ['target metadata drift',7,({values,refs})=>values.get(refs.target).Name='Changed'],
  ['autosync',3,({values,refs})=>values.get(refs.output).SyncThroughColumns=false],
  ['unsupported cast',2,({casts,refs})=>casts.delete(refs.p)],
  ['foreign session',2,({refs})=>refs.p.$S={}],
  ['changed owner',3,({x})=>x.js.FGuid='changed'],
  ['changed process',4,({x})=>x.child.data.Status=2],
  ['native identity drift',6,({refs})=>refs.source.$.$O++],
  ['decode',3,()=>{throw Error('synthetic decode failure');}],
])test('metadata refuses '+name+' and retires before further selects/data',async()=>{
  const f=await metadataFixture({hook:e=>{if(e.call===call)change(e);}});
  await assert.rejects(f.run);assert.equal(f.state().retired,true);assert.equal(f.state().published,false);assert.equal(f.calls.length,call);
  await assert.rejects(()=>readJavascriptNativeRoundtrip(f.x.f.page,f.b,decodeVariantFrame),/metadata pending\/retired/);
  assert.equal(f.x.f.counters.sent,4);await assert.rejects(f.run,/no metadata replay/);
});

test('metadata timeout retires, late selector does not invoke callback or publish DTO',async()=>{
  let finish;
  const f=await metadataFixture({hook:({call})=>call===1?new Promise(resolve=>{finish=resolve;}):undefined});
  f.b.deadline=Date.now()+35;
  await assert.rejects(f.run,/timeout/);assert.equal(f.state().pending,1);assert.equal(f.state().retired,true);
  finish();await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.state().pending,0);assert.equal(f.state().late_completions,1);assert.equal(f.state().published,false);
  assert.equal(f.state().dto,undefined);assert.equal(f.calls.length,1);
});

test('metadata lifecycle retirement remains sticky after late completed normal lifecycle',()=>{
  const lifecycle=createJavascriptMetadataLifecycle();lifecycle.update({status:'running'});assert.equal(lifecycle.uncertain,true);
  lifecycle.update({status:'retired'});
  lifecycle.update({status:'completed',api_calls:7,pending:0});
  lifecycle.update({status:'completed',requests:1,releasedRequests:1,releasedResponses:1,pending:0});
  assert.equal(lifecycle.retired,true);assert.equal(lifecycle.uncertain,true);
});

test('metadata opt-in admits only exact control and leaves default modes alone',()=>{
  assert.equal(requireJavascriptMetadataMode(undefined),false);
  assert.equal(requireJavascriptMetadataMode(true,{nativeRoundtrip:true,namedCaseId:'C-set-index'}),true);
  for(const options of [{nativeRoundtrip:false,namedCaseId:'C-set-index'},{nativeRoundtrip:true,namedCaseId:'C-set-exact'},{nativeRoundtrip:true,namedCaseId:'C-set-index',calibrationId:'K1-parse-v1'}])assert.throws(()=>requireJavascriptMetadataMode(true,options));
});

test('production metadata host waits for exact journal ACK and retires on lost ACK',async()=>{
  const f=await metadataFixture(),lifecycle=createJavascriptMetadataLifecycle(),operation={id:'metadata',deadline:Date.now()+60000};
  await assert.rejects(()=>runJavascriptNativeMetadata({execute:f.x.f.execute,binding:f.b,operation,check:()=>{},onState:s=>lifecycle.update(s),onRecord:async e=>({...e,sha256:'wrong'}),now:Date.now}),/ACK differs/);
  assert.equal(operation.transportUncertain,true);assert.equal(lifecycle.retired,true);
});

// Actual runtime orchestration, driver/capability and live catch/finally blocks;
// browser UI and wire responses remain synthetic fixture boundaries.
for(const fault of ['membership','socket','timeout','ack','ok'])test('metadata production runtime/driver/live cleanup: '+fault,async t=>{
  let finish;
  const fixture=await metadataFixture({unbound:true,reply:(f,response)=>{
    if(f.dc.FModelNode!==f.node.data){const bytes=response.$FData,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);view.setInt16(12,20,true);view.setBigInt64(14,-9007199254740991n,true);}
  },hook:({call,values,refs})=>{
    if(fault==='membership'&&call===1)values.get(refs.modelPorts).Items=[refs.item];
    if(fault==='socket'&&call===2)values.get(refs.p).Socket=refs.output;
    if(fault==='timeout'&&call===1)return new Promise(resolve=>{finish=resolve;});
  }}),f=fixture.x.f,x=fixture.x;
  f.b.package_id='d:w';x.before.package_id='d:w';
  const input=inputProof(x).input,node={document_id:'d',workflow_id:'w',node_id:'js'};
  const lifecycle=createJavascriptMetadataLifecycle(),roles=[],ui=[],events=[];
  const directory=await mkdtemp(join(tmpdir(),'js-metadata-pipeline-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const journal=createExecutionJournal({directory,metadata:{sessionId:'metadata',clientRevision:'source94'}});
  const record=async e=>{events.push(e);const saved=await journal(e);if(fault==='ack'&&e.phase==='javascript_native_metadata_observed')saved.sha256='wrong';return saved;};
  const state={prepared_node_context:{...node,verified:true,surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{index:0,active:true,tid:'output',port_guid:'js-output'}]},
    ui:{elements:[{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},node_preview_schema:{verified:true,port_guid:'js-output',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:'integer'}]}};
  const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    async checkNativeNamedEvidence() {'),end=source.indexOf('    async readNativeCivil(',start);
  assert.ok(start>=0&&end>start);
  const context={nativeTelemetryCaseId:undefined,nativeCalibrationId:undefined,nativeNamedCaseId:'C-set-index',javascriptNamedCase,nativeFixtureId:'integer-safe',nativeInputFixture:{rows:4},nativeRoundtripProbe:javascriptNamedProbe('C-set-index'),
    verifyJavascriptNamedInput,verifyJavascriptNamedOutcome,verifyNativeRoundtripExecution,freezeCivilEvidence,validateNativeSource:()=>{},page:f.page,completeJavascriptNativeRoundtrip,
    prepared:{document_id:'d',workflow_ref:{workflow_id:'w',tab_tid:'tab',prefix:'TF'}},deadline:Date.now()+30000,randomUUID:()=>String(roles.length),
    execute:async(code,options)=>{
      if(fault==='timeout'&&code.includes('async function captureJavascriptNativeMetadata')){
        return Function('return ('+code+')')()({evaluate:(fn,binding)=>f.page.evaluate(fn,{...binding,deadline:Date.now()+40})});
      }
      return f.execute(code,options);
    },nativeReadUncertain:false,metadataDiagnostic:true,metadataLifecycle:lifecycle,sessionId:'metadata',origin:'http://test',build:'7.4.2',Date,record,
    readNativeRoundtrip:async args=>{roles.push(args.role);return readNativeRoundtrip(args,{openPreview:async()=>{ui.push('open');},verifyFrontends:async()=>[],verifyCountLoaders:()=>({}),
      createProcedure:()=>{
        const current=JSON.parse(JSON.stringify(state));
        if(args.role==='upstream'){current.prepared_node_context.node_id='n';current.node_outputs.ports[0].port_guid='p';current.node_preview_schema.port_guid='p';}
        current.ui.elements.push({tid:'output',ref:'output',allowed_actions:['click','press']});
        return {observe:async({ready,condition})=>{ui.push(condition);assert.equal(ready(current),true);return current;},perform:async({resolve})=>{
          const action=resolve(current);
          if(action.ref==='close'){ui.push('PreviewClose');f.model.FPreviewManager.FPreviewVisible=false;return;}
          if(action.verb==='press'){
            f.dt.FTotalRowCount=4;f.model.FPreviewManager.FPreviewVisible=true;
            Object.assign(f.model.FPreviewManager.FPreviewForm,{FCurrentPreviewNode:f.node,FCurrentPreviewPort:f.port});
            Object.assign(f.model.FPreviewManager.FShowDataLastCall,{Node:f.node,Port:f.port});
            f.dc.FModelNode=f.node.data;f.dc.FDataSource=x.source;f.dt.FDataSource=x.source;f.store.proxy.dataSource=x.source;
          }
        }};
      }});}
  };
  const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',context);
  const getterStart=source.indexOf('    get nativeReadUncertain()',source.indexOf('async function createJavascriptBoundRuntime'));
  const getters=source.slice(getterStart,getterStart+300);
  const getterEnd=getters.indexOf('\n',getters.indexOf('get metadataReadUncertain'));
  Object.defineProperties(runtime,Object.getOwnPropertyDescriptors(vm.runInNewContext('({'+getters.slice(0,getterEnd)+'})',context)));
  let failure,result;try{result=await runtime.readNativeRoundtrip(input,node,x.execution);}catch(error){failure=error;}
  if(fault==='ok'){
    assert.ifError(failure);assert.deepEqual(roles,['output','upstream']);assert.equal(f.counters.sent,9);
    assert.equal(ui.filter(v=>v==='PreviewClose').length,2);assert.equal(runtime.nativeReadUncertain,false);
    assert.equal(runtime.metadataReadUncertain,false);assert.equal(result.output.exact.cells.length,1);
    assert.equal(result.output.exact.cells[0].value,'-9007199254740991');assert.equal(result.upstream.exact.cells.length,4);
    const dto=result.output.metadata_diagnostic.dto;assert.equal(dto.metadata_observation_complete,true);
    assert.equal(dto.D_case_complete,false);assert.equal(dto.G5_complete,false);assert.equal(fixture.calls.length,7);
    assert.equal(result.outcome.exact_pass,true);assert.equal(events.filter(e=>e.phase==='native_roundtrip_verified').length,1);
    assert.equal(events.filter(e=>e.phase==='javascript_native_metadata_observed').length,1);return;
  }
  assert.ok(failure);
  if(fault==='membership'){
    const diagnostic=JSON.parse(failure.message.split('native object association ')[1]);
    assert.deepEqual(diagnostic,{phase:'model-output-membership',api_call:1,left:fixture.refs.item.$,right:fixture.refs.w.$});
    assert.equal(fixture.calls.length,1);assert.equal(fixture.originalReads(),0);
  }
  assert.match(failure.message,fault==='ack'?/ACK differs/:fault==='timeout'?/timeout/:/association/);
  assert.deepEqual(roles,['output']);assert.equal(f.counters.sent,4);assert.equal(ui.includes('PreviewClose'),false);
  assert.equal(lifecycle.retired,true);assert.equal(runtime.nativeReadUncertain,true);assert.equal(runtime.metadataReadUncertain,true);
  const uiBefore=ui.length;
  if(finish){finish();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(fixture.state().late_completions,1);assert.equal(fixture.state().published,false);}
  lifecycle.update({status:'completed',api_calls:7,pending:0});context.nativeReadUncertain=false;
  assert.equal(runtime.nativeReadUncertain,true);assert.equal(ui.length,uiBefore);assert.equal(f.counters.sent,4);
  assert.equal(events.filter(e=>e.phase==='javascript_native_roundtrip_output_cells_verified').length,0);
  assert.equal(events.filter(e=>e.phase==='javascript_native_metadata_observed').length,fault==='ack'?1:0);
  const live=readFileSync(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const catchStart=live.lastIndexOf('} catch(error) {\n  report.status='),catchEnd=live.indexOf('  console.log(JSON.stringify({status:report.status',catchStart);
  assert.ok(catchStart>=0&&catchEnd>catchStart);
  const calls=[],report={stage:'roundtrip',cleanup:{package_closed:false,logged_out:false,browser_closed:false}};
  const forbidden=name=>()=>{calls.push(name);throw Error('unexpected '+name);};
  const cleanup=vm.runInNewContext('(async()=>{try{throw failure;'+live.slice(catchStart,catchEnd)+'}})',{
    failure,report,executionRuntime:runtime,page:f.page,owner:{},session:{context:{close:async()=>{calls.push('own-context-close');}}},browserLifecycle:null,
    sourceCycleUncertain:false,sourceReaders:[],nativeRoundtrip:true,nativeClassifierBinding:undefined,captureJavascriptNativeClassifierDiagnostic:forbidden('classifier'),
    javascriptProbeFailure:e=>({message:e.message}),redactor:{text:v=>v,redact:v=>v},discoveryProbe:null,
    snapshot:forbidden('snapshot'),paletteSnapshot:forbidden('palette'),refusalEvidence:forbidden('refusal'),guard:forbidden('guard'),observe:forbidden('observe'),
    click:forbidden('click'),calibrationTrial:null,coercionTrial:null,namedTrial:null,telemetryTrial:null,save:async()=>{calls.push('save');},Date,cleaning:false,persistence:null,coldReader:false,coldOpenPending:false,cleanupDeadline:Infinity
  });
  await cleanup();assert.deepEqual(calls,['own-context-close','save']);
  assert.equal(report.status,'CLEANUP_UNCONFIRMED');assert.match(report.cleanup.failure,/UI cleanup refused/);
  assert.equal(report.cleanup.package_closed,false);assert.equal(report.cleanup.logged_out,false);assert.equal(report.cleanup.browser_closed,true);
  assert.equal(f.counters.sent,4);assert.deepEqual(roles,['output']);
});

test('metadata production host accepts real journal envelope without weakening DTO ACK',async t=>{
  const f=await metadataFixture(),lifecycle=createJavascriptMetadataLifecycle(),operation={id:'metadata',deadline:Date.now()+60000};
  const directory=await mkdtemp(join(tmpdir(),'js-metadata-ack-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const record=createExecutionJournal({directory,metadata:{sessionId:'metadata',clientRevision:'source94'}});
  const event=await runJavascriptNativeMetadata({execute:f.x.f.execute,binding:f.b,operation,check:()=>{},onState:s=>lifecycle.update(s),onRecord:async e=>({...await record(e),case_id:'C-set-index',execution_case:'native-roundtrip'}),now:Date.now});
  assert.equal(event.dto.metadata_observation_complete,true);assert.equal(lifecycle.uncertain,false);assert.equal(lifecycle.retired,false);
});

for(const key of ['selectRange','select','selectAsync','selectRangeAsync','getPropertyValues','getPropertyValuesImpl'])test('metadata loaded function pin refuses before first API: '+key,async()=>{
  const f=await metadataFixture(),lifecycle=createJavascriptMetadataLifecycle(),events=[];
  const target=key.startsWith('getPropertyValues')?f.x.f.env.rpc.TBGSession:f.x.f.env.bg;
  target[key==='getPropertyValuesImpl'?'GetPropertyValues$1':key==='getPropertyValues'?'GetPropertyValues':key]=function replaced(){throw Error('must not call replaced function');};
  await assert.rejects(()=>runJavascriptNativeMetadata({execute:f.x.f.execute,binding:f.b,operation:{id:'pins',deadline:Date.now()+60000},check:()=>{},onState:s=>lifecycle.update(s),onRecord:async e=>{events.push(e);return e;},now:Date.now}),/public function pin differs/);
  assert.equal(f.calls.length,0);assert.equal(f.x.f.counters.sent,4);assert.equal(events.length,0);assert.equal(lifecycle.retired,true);
});
test('metadata attested function replaced between reflection and capability refuses without API',async()=>{
  const f=await metadataFixture();await f.x.f.page.evaluate(collectJavascriptMetadataSources,f.b);
  f.x.f.env.bg.selectAsync=Function('return ('+reviewedFunctions.sources.selectAsync+')')();
  await assert.rejects(f.run,/attested function identity changed/);assert.equal(f.calls.length,0);assert.equal(f.state().retired,true);
});
