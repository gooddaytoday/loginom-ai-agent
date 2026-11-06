// LGD-only saved metadata audit. Stock cold execution/table matching still
// checks every value; this audit reads settings and cancels without reapplying.
export function verifyLgdFields(fields,expected){
 if(fields.length!==expected.length||!fields.every((f,i)=>!f.excluded&&['name','label','type'].every(k=>f[k]===expected[i][k])
  &&f.data_kind===({discrete:'Дискретный',continuous:'Непрерывный'}[expected[i].data_kind]??expected[i].data_kind)))throw Error('LGD_COLD_FIELD_PROPERTIES');
 return true;
}
export async function inspectSavedLgd({load,graph,channelFor,execute,expected,outputProperties=false}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const {readPreparedNodeContext}=await load('client/lib/node-context.mjs');
 const imports=graph.nodes.filter(n=>n.type==='imports.lgd');
 if(imports.length!==1)throw Error('LGD_COLD_IMPORT_COUNT');
 for(const target of imports){
  const channel=channelFor(target.ref,outputProperties?'lgd-saved-output':'lgd-saved-settings');
  await channel.revealGraphNode({target:'body'});
  const graphState=await channel.observe({condition:'LGD cold own source',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
  await selectPreparedGraphNode(channel,graphState,'cold select LGD source',{refreshReplacedBody:true});
  if(!outputProperties){
  await openPreparedWizard(channel);
  const s=await channel.observe({condition:'LGD cold source settings',ready:s=>s.wizard?.stage==='lgd_import'});
  const binding={document_id:target.ref.document_id,workflow_ref:graph.workflow_ref,node:target.ref};
  const values=await execute(`async page=>{
   const b=${JSON.stringify(binding)},before=await (${readPreparedNodeContext.toString()})(page,b);
   if(!before.verified||before.surface!=='wizard')throw Error('LGD_COLD_OWNER');
   const r=await page.evaluate(base=>{
    const read=id=>{const es=document.querySelectorAll('[data-tid='+JSON.stringify(base+id)+']'),c=es.length===1&&Ext.getCmp(es[0].id);if(c?.el?.dom!==es[0])throw Error('LGD_COLD_CONTROL');return c.getValue();};
    return {path:read('edtFileName;ValueControl'),checksum:read('edtUseChecksum;ValueControl'),compression:read('edtCompression'),written_checksum:read('edtWrittenChecksum')};
   },b.workflow_ref.prefix+';WizrdMCF;ImportNativePreviewWizard;');
   const after=await (${readPreparedNodeContext.toString()})(page,b);
   if(JSON.stringify(before)!==JSON.stringify(after))throw Error('LGD_COLD_OWNER_CHANGED');return r;
  }`);
  if(values.checksum!==true||values.compression!=='LZ4'||values.written_checksum!=='Сжатых данных'||!/\.lgd$/i.test(values.path)
   ||expected.lgd.destination&&values.path!==expected.lgd.destination)throw Error('LGD_COLD_SOURCE_SETTINGS');
  const closed=await closePreparedWizard(channel);if(!closed.verified||closed.settings_applied!==false)throw Error('LGD_COLD_CANCEL');
  }else{
  await channel.openOutputPort(0);
  const mapping=await channel.observe({condition:'LGD cold saved output properties',readMappings:true,ready:s=>s.node_mapping?.verified&&s.node_mapping.inventory_complete});
  verifyLgdFields(mapping.node_mapping.target_fields,expected.lgd.columns);
  const done=await closePreparedWizard(channel);if(!done.verified||done.settings_applied!==false)throw Error('LGD_COLD_MAPPING_CANCEL');
  }
 }
 if(!outputProperties&&expected.lgd.kind==='roundtrip'){
  const {observeExportDestinations}=await import('./static-source-proof.mjs');
  const ds=await observeExportDestinations({load,graph:{...graph,nodes:graph.nodes.filter(n=>n.type==='exports.lgd')},channelFor,execute});
  if(ds.length!==1||ds[0].destination!==expected.lgd.destination||ds[0].lgd_settings?.compression!==2||ds[0].lgd_settings?.checksum!==1)throw Error('LGD_COLD_EXPORT_SETTINGS');
  if(expected.lgd.binding&&ds[0].lgd_binding!==expected.lgd.binding)throw Error('LGD_COLD_DESTINATION_BINDING');
 }
 return true;
}
