import {assertCaptureOwner,captureData,capturePublication} from '../retained-capture.mjs';
import {readImportCleanFacts} from './import-clean-model-v1.mjs';

const components=new WeakMap();

// Independent refusal component. Current ABI has no qualified native clean
// provider/creation packet. This evidence cannot authorize Close.
export function createImportOriginalCleanRefusal({retained,node,identity,runtime,signal,record}) {
 const need=(v,r)=>{if(!v)throw Error('LOGINOM_IMPORT_CLEAN_'+r);};
 const binding=retained?.binding,session=retained?.session,client=retained?.runtime.client;
 const call=client?.callTool,opening=node?.opening,native=node?.nativeOpening;
 const request=node?.request,preparation=session?.metadata.workspacePreparation;
 const preparationBytes=JSON.stringify(preparation),requestBytes=JSON.stringify(request),identityBytes=JSON.stringify(identity);
 const deadline=Math.min(binding?.expires,node?.deadline);
 const publication=capturePublication(retained,node,identity),publicationBytes=JSON.stringify(publication);
 const current=()=>{
  signal?.throwIfAborted();assertCaptureOwner(retained);node.assertCurrent();
  need(node.preconfig===true&&node.owner===retained&&node.runtime===runtime&&node.identity===identity
   &&signal===node.signal&&signal===retained.state.controller?.signal&&runtime.assertImportPreconfigIdle(node)===true,'ORIGINAL_SLOT');
  need(binding===retained.binding&&session===retained.session&&client===retained.runtime.client
   &&client===retained.state.client&&call===client.callTool&&typeof call==='function'&&typeof record==='function'
   &&binding.harness==='import-before-configure-v1'&&retained.resource.path==='runtime/src/acceptance/import-preconfig-adapter-v1.mjs','PRIVATE_SEAMS');
  need(opening===node.opening&&native===node.nativeOpening&&native===opening.value?.native_opening
   &&opening.effect_possible===true&&native.status==='completed'&&request===node.request
   &&JSON.stringify(request)===requestBytes&&JSON.stringify(identity)===identityBytes
   &&session.metadata.workspacePreparation===preparation&&JSON.stringify(preparation)===preparationBytes
   &&Number.isSafeInteger(deadline)&&Date.now()<deadline,'BINDING_OR_DEADLINE');
  need(JSON.stringify(capturePublication(retained,node,identity))===publicationBytes,'PUBLICATION');
  assertCaptureOwner(retained);node.assertCurrent();
 };
 const guard=async()=>{current();await node.assertOpeningCurrent();current();};
 current();const previous=components.get(node);
 if(previous){need(previous.retained===retained&&previous.identity===identity&&previous.runtime===runtime
  &&previous.signal===signal&&previous.record===record&&previous.client===client&&previous.call===call,'COMPONENT_BINDING');
  return previous.component;}
 let read,evidence;const tokens=new WeakSet();
 const missing=Object.freeze(['qualified_native_provider_creation_packet','original_package_workflow_node_port_inventory',
  'canonical_schema_enum_type_kind_output0','same_node_activity_execution_freshness','native_own_data_compatibility',
  'native_clean_before_after_await','qualified_no_other_pending_unknown_work','compatible_shared_capture_close_consumer']);
 const summary=Object.freeze({status:'REFUSED',reason:'NATIVE_CLEAN_QUALIFICATION_NOT_AVAILABLE',
  native_proof:false,clean_verified:false,close_authority:false,opening_effect:true,missing});
 const component=Object.freeze({
  observe(){
   current();
   read??=(async()=>{
    await guard();const observedIdentity=Object.freeze({...identity,workflow_id:publication.workflow_id,
     node_id:publication.node_id,read_started_at:Date.now()});
    current();const remaining=deadline-Date.now();need(remaining>0,'BINDING_OR_DEADLINE');
    const response=await call.call(client,{name:'browser_run_code_unsafe',arguments:{
     code:`async page=>page.evaluate(${readImportCleanFacts.toString()},${JSON.stringify(observedIdentity)})`}},undefined,
     {signal,timeout:remaining});
    await guard();captureData(response);need(response?.isError!==true,'TRANSPORT_REPLY');
    const blocks=response?.content?.filter(b=>b.type==='text');need(blocks?.length===1,'TRANSPORT_REPLY');
    const facts=JSON.parse(blocks[0].text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??blocks[0].text);
    captureData(facts);need(['UNKNOWN','OBSERVED_CLEAN_CANDIDATE'].includes(facts?.status)
     &&facts.close_authority===false,'FIXED_READ_BOUNDARY');
    // JSON, dirty=false and offline candidate booleans never qualify native
    // authority. Opaque diagnostic evidence remains bound to this closure.
    current();await record({event:'fixed_import_clean_refusal',publication:{...publication},facts,result:summary});
    await guard();evidence=Object.freeze(Object.create(null));tokens.add(evidence);
    return Object.freeze({...summary,evidence});
   })();
   return read;
  },
  async inspect(e){
   current();need(e&&typeof e==='object'&&tokens.has(e)&&e===evidence,'OPAQUE_EVIDENCE');
   await guard();return summary;
  },
  async requestReadonlyClose(e){
   current();need(e&&typeof e==='object'&&tokens.has(e)&&e===evidence,'OPAQUE_EVIDENCE');
   await guard();throw Error('CONFIRMED_SAVE_REQUIRED');
  }
 });
 components.set(node,{component,retained,identity,runtime,signal,record,client,call});
 return component;
}
