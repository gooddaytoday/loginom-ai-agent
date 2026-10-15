// Test-only consumer assertions. No gate, grant, owner factory or dispatch API.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pins=JSON.parse(await readFile(new URL('./historical-pins.json',import.meta.url),'utf8'));
const base=new URL('../../../../../../packages/loginom-runtime/',import.meta.url);
const runtime=process.env.PRECONFIG_RUNTIME_ROOT?pathToFileURL(process.env.PRECONFIG_RUNTIME_ROOT.replace(/\/$/,'')+'/'):base;
const {parseWorkspacePreparation}=await import(new URL('client/lib/workspace.mjs',runtime));
const {validatePreparedNodeContext}=await import(new URL('client/lib/node-context.mjs',runtime));
const ownerKeys=['owner','run','lease','generation','chat','session_id','document_id','workflow_id','account','package_path','tab_tid','loginom_build'];
const text=v=>typeof v==='string'&&v.length>0;
const same=(a,b)=>assert.deepEqual(a,b);
const need=(v,reason)=>assert.ok(v,reason);
export const contractPins=pins;
export function assertPreconfigSample(sample,{now=Date.now()}={}) {
 need(sample?.classification==='SYNTHETIC_DRIVER'||sample?.classification==='SOURCE_OWNED_TRACE','TRACE_CLASSIFICATION');
 need(sample.observation_only===true&&sample.effect_possible===false,'NO_EFFECT');
 // These counters are instrumentation requirements, not evidence manufactured here.
 for(const route of ['configure','apply','finish','execute','activate','create','save'])need(sample.dispatch?.[route]===0,'DISPATCH_'+route);
 need(sample.owner_before&&sample.owner_after,'CURRENT_OWNER');
 same(sample.owner_before,sample.owner_after);
 const owner=sample.owner_after;
 need(ownerKeys.every(k=>k==='generation'?Number.isSafeInteger(owner[k])&&owner[k]>0:text(owner[k])),'OWNER_IDENTITY');
 need(owner.lease===owner.owner+':'+owner.run,'OWNER_LEASE');
 need(owner.loginom_build==='7.4.2'&&owner.package_path.endsWith('/'+pins.package.name),'LEFT_COPY');
 need(Number.isSafeInteger(sample.original_deadline)&&sample.original_deadline>now,'ORIGINAL_DEADLINE');
 need(Number.isSafeInteger(sample.prepare_at)&&Number.isSafeInteger(sample.read_at)&&sample.prepare_at<=sample.read_at&&sample.read_at<=now,'ORDERED_READ');
 need(sample.scope==='existing_left_source_only'&&sample.settled===true&&sample.pending===false&&sample.unknown_effect===false,'SETTLED_SOURCE_ONLY');
 const prepare=parseWorkspacePreparation(sample.prepare_response);
 need(prepare.status==='READY'&&prepare.created_draft===false,'EXISTING_PREPARE');
 need(prepare.document_id===owner.document_id&&prepare.loginom_account===owner.account&&prepare.target.loginom_build===owner.loginom_build,'PREPARE_OWNER');
 need(prepare.package_ref.path===owner.package_path&&prepare.workflow_ref.tab_tid===owner.tab_tid&&prepare.workflow_ref.workflow_id===owner.workflow_id,'PREPARE_BINDING');
 need(Array.isArray(sample.imports)&&sample.imports.length===2,'IMPORT_INVENTORY');
 const identities=new Set(),uploads=new Set(),ports=new Set(),artifacts=new Set();
 for(const [i,item] of sample.imports.entries()) {
  const expected=pins.imports[i];need(item.role===expected.role,'OPERATIONS_THEN_DETAILS');
  same(item.owner,owner);need(item.sample_id===sample.sample_id&&text(sample.sample_id),'SAME_READ_SAMPLE');
  const ref=item.node_ref;
  validatePreparedNodeContext({document_id:owner.document_id,workflow_ref:prepare.workflow_ref,node:ref});
  need(ref.node_id===expected.node_guid&&!identities.has(ref.node_id),'UNIQUE_FIXED_IMPORT');identities.add(ref.node_id);
  need(item.component==='imports.text','IMPORT_COMPONENT');
  const output=item.output0;
  need(output?.status==='observed_native_binding'&&output.complete_inventory===true&&output.port===0,'CURRENT_OUTPUT0');
  same(output.node_ref,ref);need(text(output.port_guid)&&!ports.has(output.port_guid)&&output.eligible_count===1,'UNIQUE_OUTPUT0');ports.add(output.port_guid);
  need(item.readback?.scope==='pre_configuration'&&item.readback.settings_applied===false&&item.readback.complete===true,'PRECONFIG_READBACK');
  const r=item.readback,d=item.delivery;
  need(d?.status==='SUCCEEDED'&&d.cleanup_complete===true&&d.verified===true&&d.current_owner===true,'CURRENT_DELIVERY');
  same(d.owner,owner);need(text(d.artifact_id)&&text(d.operation_id)&&text(d.verification_id)&&!uploads.has(d.operation_id)&&!artifacts.has(d.artifact_id),'UNIQUE_DELIVERY');uploads.add(d.operation_id);artifacts.add(d.artifact_id);
  need(d.bytes===expected.csv.bytes&&d.sha256===expected.csv.sha256,'CSV_PIN');
  need(text(d.destination)&&d.destination.startsWith('/'+owner.account+'/')&&r.source?.source_path===d.destination,'EXACT_RETAINED_PATH');
  need(d.destination!==expected.retained_path,'NO_HISTORICAL_PATH_ADOPTION');
  need(d.lineage?.complete===true&&Array.isArray(d.lineage.records)&&d.lineage.records.length>0,'COMPLETE_ORDERED_LINEAGE');
  let previous=-1;const writes=new Set();
  for(const write of d.lineage.records){need(Object.hasOwn(write,'operation_id')&&text(write.operation_id),'WRITE_OPERATION_ID');need(Number.isSafeInteger(write.sequence)&&write.sequence>previous&&!writes.has(write.operation_id),'ORDERED_UNIQUE_WRITES');previous=write.sequence;writes.add(write.operation_id);need(write.destination===d.destination&&write.verified===true&&write.uncertain===false&&write.sha256===d.sha256&&write.bytes===d.bytes,'CURRENT_PATH_WRITES');}
  need(d.lineage.records.some(w=>w.operation_id===d.operation_id),'SELECTED_UPLOAD_IN_LINEAGE');
  for(const k of ['encoding','rows_to_skip','first_line_as_title'])same(r.source[k],expected.settings.source[k]);
  same(r.format,expected.settings.format);
  need(r.canonical_types_verified===true&&r.native_enum_binding_verified===true,'NATIVE_ENUM_PROOF');
  same(r.columns,expected.settings.columns.map((f,index)=>({index,...f})));
  need(item.activity?.status==='observed_same_node'&&item.activity.sample_id===sample.sample_id,'SAME_NODE_ACTIVITY');same(item.activity.node_ref,ref);
  need(typeof item.activity.active==='boolean','ACTIVITY_VALUE');
  need(item.freshness?.status==='observed_current_read'&&item.freshness.execution_verified===false&&item.freshness.read_at===sample.read_at,'READ_FRESHNESS_NOT_EXECUTION');
  same(item.freshness.owner,owner);need(item.freshness.sample_id===sample.sample_id,'FRESH_SAMPLE');
 }
 // Even a compatible test trace neither grants authority nor proves native safety.
 return {status:sample.classification==='SYNTHETIC_DRIVER'?'SYNTHETIC_CONTRACT_COMPATIBLE':'SOURCE_TRACE_CONTRACT_COMPATIBLE',complete:false,configure_authority:false,close_authority:false,effect_possible:false,native_proof:false,dispatch_count:0};
}
export async function checkReadAdapter(adapter,options={}) {
 need(typeof adapter?.readPreconfigSample==='function','MISSING_CLOSED_PRECONFIG_ADAPTER');
 need(/^[a-f0-9]{40}$/.test(adapter.source_sha??''),'ADAPTER_SHA');
 need(['synthetic','source','installed'].includes(adapter.path_kind),'ADAPTER_PATH_KIND');
 // Only the source-owned read seam is invoked. Never synthesize prepared state,
 // inject Map entries, or accept expected fields as adapter arguments.
 const sample=await adapter.readPreconfigSample();
 need((adapter.path_kind==='synthetic')===(sample?.classification==='SYNTHETIC_DRIVER'),'ADAPTER_CLASSIFICATION');
 return assertPreconfigSample(sample,options);
}
