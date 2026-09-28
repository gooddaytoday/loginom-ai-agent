import {createHash} from 'node:crypto';
import {javascriptNamedCase} from './javascript-native-named-cases.mjs';

const sourceHash='83cac05c5b23db232bd5a89d522e15a6665997cb9083b451c855e914f3186b2e';
export function requireJavascriptMetadataMode(enabled,{nativeRoundtrip,namedCaseId,calibrationId}={}){
  if(enabled===undefined||enabled===false)return false;
  if(enabled!==true||nativeRoundtrip!==true||namedCaseId!=='C-set-index'||calibrationId!==undefined
    ||javascriptNamedCase(namedCaseId).source_sha256!==sourceHash)throw Error('Metadata diagnostic requires fixed C-set-index roundtrip');
  return true;
}

// Exact Function#toString bytes from retained PropertySelector.js and S17 dispatcher.
// This proves these public bodies, not their lexical closures or all transitive RPC helpers.
const metadataFunctionPins=Object.freeze({
  select:'9a9566133a0d4e2b8bb402e26ec97a6efcfa862de2bda70851c0942f33be3522',
  selectAsync:'4018b7a2824aeab761e3d58f9f0603e0a369a7a80db9c18622131c4acda66eac',
  selectRangeAsync:'afc880ace4d8371bd137317a80f481fe954ca63697708a91167430b6ce0b0a37',
  getPropertyValues:'ba70173144b52cba068899409f579d192fbbd9de89e7f265d4e2683ad212966d',
  getPropertyValuesImpl:'d4192ce76315cb0231c289655ee967d05f465b3c4ae71d8cd1b8ac7e5cd17c1b'
});
export function collectJavascriptMetadataSources(b){
  const owner=globalThis.__loginomJavascriptNativeRoundtripV1,binding=owner?.bindings?.get('output');
  if(owner?.document!==document||owner.stage!=='completed'||binding?.document!==document||binding.readId!==b.binding_id
    ||binding.readStarted||owner.metadata||owner.metadataAttestation)throw Error('Metadata reflection owner/replay differs');
  const functions={select:bg.select,selectAsync:bg.selectAsync,selectRangeAsync:bg.selectRangeAsync,getPropertyValues:rpc.TBGSession.GetPropertyValues,getPropertyValuesImpl:rpc.TBGSession.GetPropertyValues$1};
  const sources=Object.fromEntries(Object.entries(functions).map(([key,value])=>{
    if(typeof value!=='function')throw Error('Metadata public function missing: '+key);
    const source=Function.prototype.toString.call(value);
    if(source.length>16384)throw Error('Metadata public function size: '+key);
    return [key,source];
  }));
  owner.metadataAttestation={document,binding,functions,sources};
  return sources;
}
export function verifyJavascriptMetadataSources(sources){
  if(!sources||Object.keys(sources).length!==5)throw Error('Metadata function attestation shape differs');
  for(const [key,pin]of Object.entries(metadataFunctionPins)){
    if(typeof sources[key]!=='string'||sources[key].length>16384||createHash('sha256').update(sources[key]).digest('hex')!==pin)
      throw Error('Metadata public function pin differs: '+key);
  }
  return {...metadataFunctionPins};
}

// Independent, monotone retirement: a subsequent normal read lifecycle cannot reset it.
export function createJavascriptMetadataLifecycle(){
  let active=false,retired=false,started=false;
  return {
    get uncertain(){return active||retired;},
    get retired(){return retired;},
    update(state){
      if(state?.status==='running'&&!started&&!retired){started=true;active=true;return;}
      if(state?.status==='completed'&&started&&active&&!retired&&state.api_calls===7&&state.pending===0){active=false;return;}
      retired=true;active=false;
    }
  };
}

// Serialized private capability. Only standard selector APIs perform metadata reads.
// All selected values are copied synchronously; no application getter survives its scope.
export async function captureJavascriptNativeMetadata(b){
  const need=(value,message)=>{if(!value)throw Error('Native metadata: '+message);};
  const own=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value;
  const owner=globalThis.__loginomJavascriptNativeRoundtripV1;
  need(b.named_case_id==='C-set-index'&&b.source_sha256==='83cac05c5b23db232bd5a89d522e15a6665997cb9083b451c855e914f3186b2e'
    &&b.roundtrip_role==='output'&&b.fixture_id==='integer-safe'&&b.input_fixture_id==='integer-safe'
    &&b.rows===1&&b.port===0&&b.method===321&&b.interface===116,'fixed source/output admission');
  need(owner?.document===document&&owner.named_case_id===b.named_case_id&&owner.source_sha256===b.source_sha256
    &&owner.stage==='completed'&&owner.schema_mode==='code'&&!owner.metadata,'completed owner; no metadata replay');
  const captured=owner.bindings.get('output');
  need(captured?.document===document&&captured.readId===b.binding_id&&!captured.readStarted,'unread owned output binding');
  const state={status:'running',retired:false,pending:0,api_calls:0,late_completions:0,published:false};
  owner.metadata=state;
  const deadline=Math.min(b.deadline,Date.now()+60000);
  const held=new Set(),identities=new Map(),functions={select:bg.select,selectAsync:bg.selectAsync,selectRangeAsync:bg.selectRangeAsync,getPropertyValues:rpc.TBGSession.GetPropertyValues,getPropertyValuesImpl:rpc.TBGSession.GetPropertyValues$1};
  const initial=captured.initial,session=own(initial.ds,'$S');
  const retire=reason=>{state.retired=true;state.status='retired';state.published=false;state.reason=reason;delete state.dto;};
  const live=()=>{
    need(!state.retired&&Date.now()<deadline,'retired/deadline');
    need(owner===globalThis.__loginomJavascriptNativeRoundtripV1&&owner.metadata===state&&owner.bindings.get('output')===captured,'capability replaced');
    need(['select','selectAsync','selectRangeAsync'].every(k=>bg[k]===functions[k])&&rpc.TBGSession.GetPropertyValues===functions.getPropertyValues&&rpc.TBGSession.GetPropertyValues$1===functions.getPropertyValuesImpl,'selector replaced');
    const current=captured.capture(b);
    need(Object.keys(initial).every(k=>current[k]===initial[k]),'owner/process/source/cache changed');
    for(const [object,value] of identities)need(own(object,'$S')===session&&own(object,'$')===value.identity
      &&JSON.stringify([own(value.identity,'$OW'),own(value.identity,'$O'),own(value.identity,'$I')])===value.key,'native identity/session changed');
  };
  const hold=object=>{
    need(object&&typeof object==='object'&&own(object,'$S')===session,'native proxy/session');
    const identity=own(object,'$'),tuple=['$OW','$O','$I'].map(k=>own(identity,k));
    need(tuple.every(Number.isInteger)&&tuple[0]>=0&&tuple[1]>=0&&tuple[2]>=0,'native proxy identity');
    held.add(object);need(held.size<=32,'held objects bound');
    if(!identities.has(object))identities.set(object,{identity,key:JSON.stringify(tuple)});
    return object;
  };
  const same=(a,z)=>{
    hold(a);hold(z);
    need(own(own(a,'$'),'$OW')===own(own(z,'$'),'$OW')&&own(own(a,'$'),'$O')===own(own(z,'$'),'$O'),'native object association');
  };
  // Read only the cast installed by this selected descriptor. Never QueryInterface fallback.
  const selectedCast=(object,type)=>{
    const entry=own(object,'__$selfCast'),map=own(entry,'CachedCasts');
    need(map&&typeof type==='function','selected cast unavailable');
    const value=Map.prototype.get.call(map,type);
    need(own(value,'cnt')>0,'selected cast scope');
    return hold(own(value,'obj'));
  };
  const text=value=>{need(typeof value==='string'&&value.length<=128&&new TextEncoder().encode(value).length<=512,'metadata string bound');return value;};
  const identity=object=>{hold(object);return {owner:own(own(object,'$'),'$OW'),object:own(own(object,'$'),'$O'),interface:own(own(object,'$'),'$I')};};
  const field=value=>{
    hold(value);need(value.Index===0&&value.DataType===4&&Number.isSafeInteger(value.ID)&&value.ID>=0,'Integer field/index/id');
    return {identity:identity(value),id:value.ID,index:value.Index,name:text(value.Name),display_name:text(value.DisplayName),data_type:value.DataType,collection:identity(value.Collection)};
  };
  const fields=c=>[c,c.ID,c.Index,c.Name,c.DisplayName,c.DataType,bg.select(c.Collection,x=>[x])];
  const one=collection=>{hold(collection);need(collection.Count===1,'one native item');return hold(collection.Items(0));};
  const step=async(start,copy)=>{
    live();need(state.pending===0&&state.api_calls<7,'API operation bound');
    state.api_calls++;state.pending=1;
    let timer;
    const work=Promise.resolve().then(start).then(handler=>{
      if(state.retired){state.late_completions++;return;}
      live();need(typeof handler==='function','selector handler');
      let called=0;
      const result=handler(value=>{need(++called===1,'one synchronous callback');live();copy(value);live();});
      need(called===1&&!(result&&typeof result.then==='function'),'synchronous selector callback');
      live();
    }).finally(()=>{state.pending=0;});
    try{await Promise.race([work,new Promise((_,reject)=>{
      timer=setTimeout(()=>{retire('metadata deadline');reject(Error('Native metadata: API timeout; cancellation unconfirmed'));},Math.min(10000,deadline-Date.now()));
    })]);live();}finally{clearTimeout(timer);}
  };
  const refs={},dto={version:1,kind:'C-set-index-metadata-v1',source_sha256:b.source_sha256,
    document_id:b.document_id,workflow_id:b.workflow_id,node_id:b.node_id,port_guid:b.port_guid,binding_id:b.binding_id,
    execution_id:b.completed_child.execution_id,selector_function_sha256:b.metadata_function_sha256,metadata_observation_complete:false,D_case_complete:false,G5_complete:false,
    consistency:'point_in_time_metadata_observation',code_generated_provenance:false,wire_request_count_verified:false};
  try{
    need(owner.metadataAttestation?.document===document&&owner.metadataAttestation.binding===captured&&Object.keys(functions).every(k=>owner.metadataAttestation.functions[k]===functions[k]),'attested function identity changed');
    need(Object.keys(functions).every(k=>typeof b.metadata_function_sources?.[k]==='string'&&Function.prototype.toString.call(functions[k])===b.metadata_function_sources[k]),'attested public function changed');
    live();hold(initial.nodeData);hold(initial.portData);hold(initial.ds);
    await step(()=>bg.selectAsync(initial.portData,w=>[w,w.Index,bg.select(w.Socket,x=>[x]),
      bg.select(w.Parent,ports=>[ports,bg.select(ports.ParentNode,n=>[n,
        bg.select(n.OutputPorts,x=>[x]),bg.select(n.Component,c=>[c,bg.select(c.Engine,e=>[e,bg.select(e.OutputPorts,x=>[x,x.Count])])])])])]),w=>{
      same(w,initial.portData);need(w.Index===0,'native output index');
      const n=w.Parent.ParentNode;same(n,initial.nodeData);same(w.Parent,n.OutputPorts);
      refs.socket=hold(w.Socket);refs.component=hold(n.Component);refs.engine=hold(n.Component.Engine);
      refs.ports=hold(refs.engine.OutputPorts);need(refs.ports.Count===1,'one engine output port');
      dto.owner={node:identity(n),port:identity(w),socket:identity(refs.socket),component:identity(refs.component),engine:identity(refs.engine),engine_ports:identity(refs.ports)};
    });
    await step(()=>bg.selectRangeAsync(refs.ports,0,1,item=>[item,item.Index,
      bg.select(item.Port,bg.IBGColumnsMappingEngineOutputPort,p=>[p,bg.select(p.Socket,x=>[x])])]),ports=>{
      same(ports,refs.ports);const item=one(ports);need(item.Index===0,'engine item index');
      refs.p=selectedCast(item.Port,bg.IBGColumnsMappingEngineOutputPort);same(refs.p.Socket,refs.socket);
      dto.owner.engine_port=identity(refs.p);
    });
    await step(()=>bg.selectAsync(refs.p,p=>[p,
      bg.select(p.SourceColumns,x=>[x,x.Count]),bg.select(p.TargetColumns,x=>[x,x.Count]),
      bg.select(p.Socket,s=>[s,bg.select(s.Output,bg.IBGCustomDerivedDataSource,d=>[d,d.SyncThroughColumns,bg.select(d.ColumnDefs,x=>[x,x.Count])])])]),p=>{
      same(p,refs.p);same(p.Socket,refs.socket);refs.s=hold(p.SourceColumns);refs.t=hold(p.TargetColumns);
      refs.output=selectedCast(p.Socket.Output,bg.IBGCustomDerivedDataSource);
      need(refs.output.SyncThroughColumns===true,'observed autosync');
      need(refs.s.Count===1&&refs.t.Count===1&&refs.output.ColumnDefs.Count===1,'one schema column');
      same(refs.t,refs.output.ColumnDefs);
      dto.autosync=true;dto.collections={source:identity(refs.s),target:identity(refs.t),socket_output:identity(refs.output)};
    });
    await step(()=>bg.selectAsync(initial.ds,d=>[d,bg.select(d.ColumnDefs,x=>[x,x.Count])]),d=>{
      same(d,initial.ds);need(d.ColumnDefs.Count===1,'physical column count');
      refs.physical=hold(d.ColumnDefs);same(refs.physical,refs.t);dto.collections.physical=identity(refs.physical);dto.datasource=identity(d);
    });
    await step(()=>bg.selectRangeAsync(refs.s,0,1,fields),s=>{
      same(s,refs.s);refs.source=one(s);same(refs.source.Collection,refs.s);dto.source=field(refs.source);
    });
    await step(()=>bg.selectRangeAsync(refs.t,0,1,t=>[...fields(t),
      bg.select(t.Extensions,bg.IBGColumnDefMappingExtension,e=>[e,e.SourceIndex,bg.select(e.Source,fields)])]),t=>{
      same(t,refs.t);refs.target=one(t);same(refs.target.Collection,refs.t);
      const extension=selectedCast(refs.target.Extensions,bg.IBGColumnDefMappingExtension);
      need(extension.SourceIndex===0,'mapping source index');same(extension.Source,refs.source);same(extension.Source.Collection,refs.s);
      need(JSON.stringify(field(extension.Source))===JSON.stringify(dto.source),'source metadata changed');
      dto.target=field(refs.target);dto.mapping={extension:identity(extension),source:identity(extension.Source),source_index:extension.SourceIndex};
    });
    await step(()=>bg.selectRangeAsync(refs.physical,0,1,fields),c=>{
      same(c,refs.physical);const physical=one(c);same(physical,refs.target);same(physical.Collection,refs.physical);
      dto.physical=field(physical);need(JSON.stringify(dto.physical)===JSON.stringify(dto.target),'target metadata changed');
      need(dto.physical.name===own(initial.field,'Name')&&dto.physical.display_name===own(initial.field,'DisplayName')
        &&dto.physical.data_type===own(initial.field,'DataType'),'physical preview corroboration');
    });
    live();need(state.api_calls===7&&state.pending===0,'completed seven API calls');
    dto.api_calls=state.api_calls;dto.held_objects=held.size;dto.metadata_observation_complete=true;
    need(new TextEncoder().encode(JSON.stringify(dto)).length<=16384,'DTO byte bound');
    // JSON copy contains no proxies/getters. Capability references remain page-local.
    state.dto=JSON.parse(JSON.stringify(dto));state.status='completed';state.published=true;
    state.held=held;return state.dto;
  }catch(error){retire('metadata read refused or uncertain');throw error;}
}

export async function runJavascriptNativeMetadata({execute,binding,operation,check,onState,onRecord,now}){
  requireJavascriptMetadataMode(true,{nativeRoundtrip:true,namedCaseId:binding.named_case_id,calibrationId:binding.calibration_id});
  const deadline=Math.min(binding.deadline,operation.deadline,now()+60000);
  try{
    check();await onState({status:'running'});
    const metadata_function_sources=await execute(`async page=>page.evaluate(${collectJavascriptMetadataSources.toString()},${JSON.stringify(binding)})`,{timeout:Math.max(1,deadline-now())});
    const metadata_function_sha256=verifyJavascriptMetadataSources(metadata_function_sources);check();
    const dto=await execute(`async page=>page.evaluate(${captureJavascriptNativeMetadata.toString()},${JSON.stringify({...binding,deadline,metadata_function_sources,metadata_function_sha256})})`,{timeout:Math.max(1,deadline-now())});
    check();
    if(dto?.metadata_observation_complete!==true||dto.api_calls!==7||dto.D_case_complete!==false||dto.G5_complete!==false
      ||JSON.stringify(dto.selector_function_sha256)!==JSON.stringify(metadata_function_sha256)||dto.binding_id!==binding.binding_id||dto.source_sha256!==sourceHash||Buffer.byteLength(JSON.stringify(dto))>16384)throw Error('Metadata DTO acknowledgement shape differs');
    const event={phase:'javascript_native_metadata_observed',operation_id:operation.id,dto,sha256:createHash('sha256').update(JSON.stringify(dto)).digest('hex')};
    const saved=await onRecord(event);
    if(!Object.keys(event).every(k=>JSON.stringify(saved?.[k])===JSON.stringify(event[k])))throw Error('Metadata journal ACK differs');
    check();await onState({status:'completed',api_calls:7,pending:0});return event;
  }catch(error){operation.transportUncertain=true;await onState({status:'retired',uncertain:true});throw error;}
}
