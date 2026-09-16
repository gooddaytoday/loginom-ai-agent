import {bindLoadedNativeRuntime,collectNativeRuntime,verifyLoadedNativeRuntime} from './collapse-native-runtime.mjs';
import {createHash} from 'node:crypto';
import {completedStaticImports,bindCollapseNative} from './collapse-native-source.mjs';
import {decodeVariantFrame} from './variant-native-decode.mjs';
import {readNativeVariant,cancelNativeVariant,nativeVariantStatus} from './variant-native-read.mjs';
import {adaptRead,nativeUserPort,temporalProfile} from './variant-native-values.mjs';
const need=(x,m)=>{if(!x)throw Error(m);};
export async function recordNativeProof(onRecord,operationId,proof) {
 // The journal canonicalizes URLs during redaction. Normalize the non-secret
 // origin in the evidence copy; the browser binding retains location.origin.
 proof={...proof,binding:{...proof.binding,origin:new URL(proof.binding.origin).href}};
 const event={phase:'collapse_native_full_completed',operation_id:operationId,proof},saved=await onRecord(event);
 need(saved?.phase===event.phase&&saved.operation_id===operationId&&JSON.stringify(saved.proof)===JSON.stringify(proof),'Exact read proof was not durably acknowledged');
}
export const nativeFrontendPins=Object.freeze({
 'rpc.js':'afeb91811a02da1f7841fb8c03e3003686c98a051f09186af082a3c44a12b4cc',
 'bg.rtl.rpc.js':'11ac2c63d2e8162b974f57d14e0f4f57b19cc80d3d39797be377e22eced6a973',
 'bg.model.rpc.js':'53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f',
 'SysUtils.js':'d9c9e13ec69d4676d41a661855c18e19bfb0c928a39d8c550435f18631362bd4',
 'BitConverter.js':'03f051286c276608da7023ed91cc9ef5c3d61fcca69f75de390d4b72005f8100',
});
async function verifyFrontends(execute,origin,signal) {
 const urls=await execute(`async page=>page.evaluate(names=>Object.fromEntries(names.map(name=>{
  const urls=[...document.scripts].map(s=>s.src).filter(u=>u&&new URL(u).pathname.split('/').at(-1)===name);
  if(urls.length!==1)throw Error('Unique pinned frontend required');return [name,urls[0]];
 })),${JSON.stringify(Object.keys(nativeFrontendPins))})`,{timeout:10000});
 const proofs=[];
 for(const [name,url] of Object.entries(urls)) {
  signal?.throwIfAborted();need(new URL(url).origin===origin,'Foreign native frontend');
  const response=await fetch(url,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
  need(response.ok,'Native frontend fetch failed');
  let size=0;const hash=createHash('sha256');
  for await(const chunk of response.body){size+=chunk.length;need(size<=10000000,'Native frontend byte bound');hash.update(chunk);}
  const sha256=hash.digest('hex');need(sha256===nativeFrontendPins[name],'Native frontend changed: '+name);proofs.push({name,url,sha256});
 }
 need(proofs.length===5,'Incomplete native frontend provenance');return proofs;
}

export async function readCollapseNativeOutput(channel,read,ctx,options,config) {
 const {execute,operation,onRecord,now}=options;
 need(options.exclusiveNodeOperation?.()===true,'Exact read requires the owning executor operation lock');
 const imports=completedStaticImports(options.nodeHistory?.(),options.verifiedUploads?.(),ctx,options.uploadHistory?.());
 const frontends=await verifyFrontends(execute,config.targetOrigin,ctx.signal);
 const graph=s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent';
 let s=await channel.observe({condition:'exact output graph',readOutputs:true,ready:s=>graph(s)&&s.node_outputs?.verified===true});
 const ports=s.node_outputs.ports.filter(p=>p.index===0);need(ports.length===1&&ports[0].active===true,'Active exact output required');const port=ports[0];
 const control=(s,verb)=>{const es=s.ui.elements.filter(e=>e.tid===port.tid&&e.allowed_actions.includes(verb));need(es.length===1,'Exact output control unavailable');return es[0];};
 await channel.perform({condition:'select exact output Preview',initialObservation:s,ready:graph,identity:()=>ctx.node,resolve:s=>({verb:'click',ref:control(s,'click').ref})});
 s=await channel.observe({condition:'exact output Preview command',ready:s=>graph(s)&&s.ui.elements.some(e=>e.tid===port.tid&&e.allowed_actions.includes('press'))});
 await channel.perform({condition:'open exact output Preview',initialObservation:s,ready:graph,identity:()=>ctx.node,resolve:s=>({verb:'press',ref:control(s,'press').ref,key:'F3'})});
 const preview=await channel.observe({condition:'exact output complete schema',readPreview:true,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid&&s.node_preview_schema.port===0});
 const codes={boolean:1,datetime:2,real:3,integer:4,string:5,variant:6};
 const args={document_id:ctx.document_id,workflow_id:ctx.workflow_ref.workflow_id,package_id:ctx.document_id+':'+ctx.workflow_ref.workflow_id,
  node_id:ctx.node.node_id,port_guid:port.port_guid,execution:ctx.execution,tab_tid:ctx.workflow_ref.tab_tid,prefix:ctx.workflow_ref.prefix,
  origin:config.targetOrigin,imports,schema:preview.node_preview_schema.fields.map(f=>({name:f.name,label:f.label,type:codes[f.type]}))};
 const readId='native-'+createHash('sha256').update(operation.id+':'+ctx.execution.execution_id).digest('hex').slice(0,48);
 const loaded=await execute(`async page=>(${bindLoadedNativeRuntime.toString()})(page,${JSON.stringify({...args,binding_id:readId})},${collectNativeRuntime.toString()})`,{timeout:10000});
 const loadedRuntime=verifyLoadedNativeRuntime(loaded,{binding_id:readId,document_id:ctx.document_id});
 const binding=await execute(`async page=>(${bindCollapseNative.toString()})(page,${JSON.stringify(args)})`,{timeout:10000});
 const countLoaderPins={PrepareColumnInfoAndRowCount:'d952415558676c3caf569a51d88bf026e661abdaaf08842d870ddba139730e3f',InitOutput:'c01544ac551e88997f9cea9b62314234ad435bc7632357861cdfc6013e89960e',DataSourceProxyRead:'6206671eaf111d80459c3ed1d5878125ef37918fb1abacc1cd19ce42c7fdf91d'};
 for(const [name,pin] of Object.entries(countLoaderPins))need(createHash('sha256').update(binding.count_loader_sources[name]).digest('hex')===pin,'Native count loader changed: '+name);
 delete binding.count_loader_sources;binding.runtime_binding_id=readId;
 const timeoutMs=Math.min(30000,ctx.deadline-now());need(timeoutMs>0,'Exact read deadline elapsed');
 ctx.signal?.throwIfAborted();need(options.exclusiveNodeOperation()===true,'Exact operation exclusion lost');
 let cancellation;
 const abort=()=>{operation.transportUncertain=true;cancellation=execute(`async page=>(${cancelNativeVariant.toString()})(page,${JSON.stringify(readId)})`,{timeout:5000}).catch(()=>null);};
 ctx.signal?.addEventListener('abort',abort,{once:true});
 let native;
 try {
  native=await execute(`async page=>{const result=await (${readNativeVariant.toString()})(page,${JSON.stringify(binding)},${decodeVariantFrame.toString()},{operationId:${JSON.stringify(readId)},timeoutMs:${timeoutMs},maxBytes:1048576});return {result,lifecycle:await (${nativeVariantStatus.toString()})(page)};}`,{timeout:timeoutMs+5000});
  ctx.signal?.throwIfAborted();need(options.exclusiveNodeOperation()===true,'Exact operation exclusion lost');
 }catch(error){operation.transportUncertain=true;throw error;}
 finally{ctx.signal?.removeEventListener('abort',abort);if(cancellation)await cancellation;}
 const expected={...binding,read_id:readId},consistency={kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'};
 const exact=adaptRead(native.result,{expected,lifecycle:native.lifecycle,dateProfile:temporalProfile,consistency});
 need(exact.coverage.table_complete,'Full exact read was incomplete');
 const value=nativeUserPort(exact,{sampleRows:read.sample_rows});
 const root=preview.node_preview_schema.root_tid;
 const closing=await channel.observe({condition:'owned exact Preview before close',readPreview:true,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid});
 await channel.perform({condition:'close exact output Preview',initialObservation:closing,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid,
  identity:()=>({node:ctx.node,port_guid:port.port_guid,root}),resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===root+';p.h;close'&&e.allowed_actions.includes('click'));need(es.length===1,'Owned Preview close unavailable');return {verb:'click',ref:es[0].ref};}});
 const returned=await channel.observe({condition:'exact output graph restored',ready:graph});
 const proof={binding,loaded_runtime:loadedRuntime,count_loader_sha256:countLoaderPins,read_id:readId,frontends,lifecycle:native.lifecycle,coverage:exact.coverage,source_profile:binding.static_source};
 await recordNativeProof(onRecord,operation.id,proof);
 return {verified:true,cleanup_complete:true,effect_possible:true,status:'complete',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,
  ports:[{port:0,port_guid:port.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...value,
   precision:{numbers_verified:true,limitations:exact.limitations,strings:'exact_native'},filter_enabled:false}],
  workflow_return:{verified:true,node_context:returned.prepared_node_context}};
}
