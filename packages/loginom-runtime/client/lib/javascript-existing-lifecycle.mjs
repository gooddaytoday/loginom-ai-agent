import {javascriptSourceSettingsDigest} from './javascript-source-admission.mjs';
import {readObservedJavascriptDeclaredColumns} from './javascript-declared-schema.mjs';
import {javascriptManagedSourceSettings} from './javascript-managed-source-adapter.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

// Host-only boundary between an independent full source admission and the next
// editor mutation. Preserve all native settings and require the same node.
export function javascriptExistingLifecycleBaseline({receipt,snapshot,parameters,owner}) {
  need(receipt?.phase==='admitted'&&receipt.kind==='existing'
    &&['replace','preserve'].includes(receipt.intent)&&same(receipt.owner,owner)
    &&same(snapshot?.owner,owner)&&snapshot.schema?.verified===true
    &&snapshot.schema.node_context?.verified===true
    &&snapshot.schema.node_context.surface==='wizard'
    &&['document_id','workflow_id','node_id'].every(key=>snapshot.schema.node_context[key]===owner[key])
    &&receipt.settings_sha256===javascriptSourceSettingsDigest(snapshot.settings)
    &&receipt.settings_sha256===javascriptSourceSettingsDigest(javascriptManagedSourceSettings(snapshot.schema)),
  'JavaScript existing source/settings owner baseline differs');
  const schema_mode=snapshot.settings.generation?'code':'declared';
  need(typeof snapshot.settings.generation==='boolean'
    &&snapshot.schema.generation?.checked===snapshot.settings.generation
    &&(parameters.schema_mode===undefined||parameters.schema_mode===schema_mode)
    &&parameters.columns===undefined,'JavaScript existing lifecycle preserves observed schema');
  need(/^[a-f0-9]{64}$/.test(receipt.previous_source?.source_sha256)
    &&/^[a-f0-9]{64}$/.test(receipt.effective_source?.source_sha256)
    &&(parameters.expected_source_sha256===undefined
      ||parameters.expected_source_sha256===receipt.previous_source.source_sha256),
  'JavaScript existing source digest baseline differs');
  return {schema_mode,settings_sha256:receipt.settings_sha256,
    ...(schema_mode==='declared'?{columns:readObservedJavascriptDeclaredColumns(snapshot.schema)}:{})};
}
