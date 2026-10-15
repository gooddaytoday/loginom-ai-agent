import {createHash} from 'node:crypto';

// Serialized, read-only local-cache proof. No count fallback, helper init or RPC.
export function captureJavascriptNativeZero({dc,dt,store,helper,fields,field,declaration,declaration_sha256}) {
  const value=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value;
  const need=(ok,message)=>{if(!ok)throw Error('Declared empty zero: '+message);};
  const proxy=value(store,'proxy'),names=value(proxy,'FDataFieldNames'),getters=value(proxy,'FValueGetters');
  const pending=value(proxy,'pendingOperations'),pages=value(store,'pageRequests');
  const counts={dc:value(dc,'FTotalRowCount'),dt:value(dt,'FTotalRowCount'),proxy:value(proxy,'FTotalRowCount'),
    store:value(store,'totalCount'),helper:value(helper,'$FRowCount')};
  need(Object.values(counts).every(n=>n===0&&!Object.is(n,-0)),'five observed zero counts');
  need(value(store,'loading')===false&&value(helper,'$FCacheInitialized')===false&&value(helper,'$FData')===null,'specific idle zero cache');
  const empty=o=>o&&typeof o==='object'&&!Array.isArray(o)&&Reflect.ownKeys(o).length===0;
  need(empty(pending)&&empty(pages),'observed empty pending/page queues');
  need(Array.isArray(names)&&names.length===1&&names[0]==='Value'&&Array.isArray(getters)&&getters.length===1&&typeof getters[0]==='function','complete field map/getter');
  need(Array.isArray(fields)&&fields.length===1&&value(fields[0],'data')===field,'held complete field metadata');
  const schema=[{index:0,name:value(field,'Name'),label:value(field,'DisplayName'),type:value(field,'DataType')}];
  need(schema[0].name==='Value'&&schema[0].label==='Value'&&schema[0].type===4
    &&declaration?.fixture_id==='cardinality-empty'&&declaration.schema_mode==='declared'&&declaration.generation===false
    &&declaration.apply_verified===true&&typeof declaration.field?.required==='boolean'
    &&declaration.field.name==='Value'&&declaration.field.label==='Value'&&declaration.field.type===4&&declaration.field.index===0
    &&/^[a-f0-9]{64}$/.test(declaration_sha256),'native metadata matches actual UI declaration');
  need(typeof dc.PrepareColumnInfoAndRowCount==='function'&&typeof dc.InitOutput==='function'&&typeof proxy.read==='function','observed count loaders');
  const facts={counts,store_loading:value(store,'loading'),cache_initialized:value(helper,'$FCacheInitialized'),cache_is_null:value(helper,'$FData')===null,
    schema,field_names:[...names],getter_count:getters.length,getters_are_functions:getters.every(g=>typeof g==='function'),
    pending_operations:Reflect.ownKeys(pending).length,page_requests:Reflect.ownKeys(pages).length,field_count:fields.length,
    schema_mode:'declared',declaration_sha256,loader_methods_observed:true};
  return {zeroFacts:JSON.stringify(facts),zeroProxy:proxy,zeroNames:names,zeroGetters:getters,zeroGetter:getters[0],zeroPending:pending,zeroPages:pages,
    zeroFieldRecord:fields[0],zeroCountLoader:dc.PrepareColumnInfoAndRowCount,zeroInitLoader:dc.InitOutput,zeroProxyLoader:proxy.read};
}

export function verifyJavascriptDeclaredEmpty(declaration,digest) {
  const f=declaration?.field;
  if(declaration?.fixture_id!=='cardinality-empty'||declaration.schema_mode!=='declared'||declaration.generation!==false
    ||declaration.apply_verified!==true||typeof declaration.page_tid!=='string'||!declaration.page_tid.endsWith(';JavaScriptColumnsWizard')
    ||typeof f?.record_id!=='string'||!f.record_id||f.name!=='Value'||f.label!=='Value'||f.type!==4||f.index!==0||typeof f.required!=='boolean'
    ||createHash('sha256').update(JSON.stringify(declaration)).digest('hex')!==digest)throw Error('Exact UI-declared empty witness required');
}

export function verifyJavascriptZeroAdmission(raw,binding) {
  verifyJavascriptDeclaredEmpty(binding.declaration,binding.declaration_sha256);
  const pins={PrepareColumnInfoAndRowCount:'d952415558676c3caf569a51d88bf026e661abdaaf08842d870ddba139730e3f',InitOutput:'c01544ac551e88997f9cea9b62314234ad435bc7632357861cdfc6013e89960e',DataSourceProxyRead:'6206671eaf111d80459c3ed1d5878125ef37918fb1abacc1cd19ce42c7fdf91d'};
  if(JSON.stringify(binding.count_loader_sha256)!==JSON.stringify(pins))throw Error('Pinned zero count loaders required');
  if(!binding.subscriptions||Object.keys(binding.subscriptions).length!==2||!['data','state'].every(k=>{
    const value=binding.subscriptions[k];if(['missing','undefined','null'].includes(value))return true;
    if(typeof value!=='string')return false;
    const tuple=JSON.parse(value);return Array.isArray(tuple)&&tuple.length===5&&tuple[2]===206&&tuple.every(n=>Number.isInteger(n)&&!Object.is(n,-0)&&n>=-2147483648&&n<=2147483647)&&tuple[0]>=0&&tuple[3]>=0&&tuple[4]>=0;
  }))throw Error('Observed zero subscription shape required');
  const before=raw.zero_admission?.before,final=raw.zero_admission?.final;
  if(!before||!final||JSON.stringify({...before,phase:'final'})!==JSON.stringify(final))throw Error('Zero before/final observations differ');
  for(const phase of ['before','final']){
    const r=raw.zero_admission[phase],f=r.facts,s=f?.schema?.[0];
    if(r.phase!==phase||r.read_id!==raw.read_id||r.fixture_id!=='cardinality-empty'||r.role!=='output'||r.interface!==116||r.interface!==raw.interface
      ||['document_id','workflow_id','package_id','node_id','port_guid','source_sha256','declaration_sha256'].some(k=>r[k]!==binding[k])
      ||JSON.stringify(r.source)!==JSON.stringify(binding.source)||JSON.stringify(r.execution)!==JSON.stringify(Object.fromEntries(['execution_id','group_id','process_id','process_record_id'].map(k=>[k,binding.completed_child[k]])))
      ||r.owner_verified!==true||r.process_idle!==true||r.held_identity_verified!==true
      ||JSON.stringify(r.count_loader_sha256)!==JSON.stringify(binding.count_loader_sha256)
      ||!binding.count_loader_sha256||Object.keys(binding.count_loader_sha256).length!==3
      ||!Object.values(binding.count_loader_sha256).every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))
      ||!f?.counts||Object.keys(f.counts).length!==5||!['dc','dt','proxy','store','helper'].every(k=>f.counts[k]===0&&!Object.is(f.counts[k],-0))
      ||f.store_loading!==false||f.cache_initialized!==false||f.cache_is_null!==true||f.pending_operations!==0||f.page_requests!==0
      ||f.field_count!==1||f.schema?.length!==1||s.name!=='Value'||s.label!=='Value'||s.type!==4||s.index!==0
      ||JSON.stringify(f.field_names)!=='["Value"]'||f.getter_count!==1||f.getters_are_functions!==true||f.loader_methods_observed!==true
      ||f.schema_mode!=='declared'||f.declaration_sha256!==binding.declaration_sha256
      ||JSON.stringify(r.subscriptions)!==JSON.stringify(binding.subscriptions))throw Error('Observed zero admission differs');
  }
}
