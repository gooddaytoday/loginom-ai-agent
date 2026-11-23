// LGD-only saved metadata audit. Stock cold execution/table matching still
// checks every value; this audit reads settings and cancels without reapplying.
export function verifyLgdFields(fields,expected){
 if(fields.length!==expected.length||!fields.every((f,i)=>!f.excluded&&['name','label','type'].every(k=>f[k]===expected[i][k])
  &&f.data_kind===({discrete:'Дискретный',continuous:'Непрерывный'}[expected[i].data_kind]??expected[i].data_kind)))throw Error('LGD_COLD_FIELD_PROPERTIES');
 return true;
}
export async function inspectSavedLgd({load,graph,channelFor,execute,expected,origin,outputProperties=false}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const {readPreparedNodeContext}=await load('client/lib/node-context.mjs');
 const imports=graph.nodes.filter(n=>n.type==='imports.lgd');
 const formats=['compression','edges'].includes(expected.lgd.kind)?(expected.lgd.formats??null):null;
 const cases=expected.lgd.imports??(formats?formats.map(f=>({label:f.import_label,columns:f.columns??expected.lgd.columns,
  compression:f.compression_display,written_checksum:f.checksum_display,checksum:true,destination:f.destination})):
  [{...expected.lgd,compression:'LZ4',written_checksum:'Сжатых данных',checksum:true}]);
 if(imports.length!==cases.length)throw Error('LGD_COLD_IMPORT_COUNT');
 for(const target of imports){
  const matches=cases.filter(c=>c.label===undefined||c.label===target.label);
  if(matches.length!==1)throw Error('LGD_COLD_IMPORT_IDENTITY');
  const wanted=matches[0];
  const channel=channelFor(target.ref,outputProperties?'lgd-saved-output':'lgd-saved-settings');
  await channel.revealGraphNode({target:'body'});
  const graphState=await channel.observe({condition:'LGD cold own source',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
  await selectPreparedGraphNode(channel,graphState,'cold select LGD source',{refreshReplacedBody:true});
  if(!outputProperties){
  const binding={document_id:target.ref.document_id,workflow_ref:graph.workflow_ref,node:target.ref};
  let variables=[];
  if(expected.lgd.source_variable){
   const {configureVariablePortMapping}=await load('client/lib/variable-port-mapping.mjs');
   const {openPreparedOutputPort}=await load('client/lib/node-port-open.mjs');
   const {decodePortCell}=await load('client/lib/node-port-output.mjs');
   const task={binding,mapping:{direction:'input',kind:'variables',port:0},read_only:true,origin,build:'7.4.2',operation_id:'lgd-cold-variable-'+target.ref.node_id,deadline:Date.now()+300000};
   const result=await execute(`async page=>(${configureVariablePortMapping.toString()})(page,${JSON.stringify(task)},${readPreparedNodeContext.toString()},${openPreparedOutputPort.toString()},${decodePortCell.toString()})`);
   if(!result.verified||!result.cleanup_complete)throw Error('LGD_COLD_VARIABLE_MAPPING');
   variables=result.mapping.fields.filter(v=>v.type===5&&!v.is_null&&v.source?.type===5);
  }
  await openPreparedWizard(channel);
  const s=await channel.observe({condition:'LGD cold source settings',ready:s=>s.wizard?.stage==='lgd_import'});
  const values=await execute(`async page=>{
   const b=${JSON.stringify(binding)},before=await (${readPreparedNodeContext.toString()})(page,b);
   if(!before.verified||before.surface!=='wizard')throw Error('LGD_COLD_OWNER');
   const r=await page.evaluate(({base,variables})=>{
    const read=id=>{const es=document.querySelectorAll('[data-tid='+JSON.stringify(base+id)+']'),c=es.length===1&&Ext.getCmp(es[0].id);if(c?.el?.dom!==es[0])throw Error('LGD_COLD_CONTROL');return c.getValue();};
    const buttons=document.querySelectorAll('[data-tid='+JSON.stringify(base+'edtFileName;SwitchButton')+']'),button=buttons.length===1&&Ext.getCmp(buttons[0].id);
    if(!button||button.el.dom!==buttons[0]||typeof button.pressed!=='boolean')throw Error('LGD_COLD_BINDING_MODE');
    let path,source_variable;
    if(button.pressed){
     const es=document.querySelectorAll('[data-tid='+JSON.stringify(base+'edtFileName;VariableControl')+']'),c=es.length===1&&Ext.getCmp(es[0].id);
     if(!c||c.el.dom!==es[0])throw Error('LGD_COLD_BINDING_OWNER');
     const rows=c.getStore().getData().items.filter(r=>r.data.field1===c.getValue());
     const matches=variables.filter(v=>rows.length===1&&rows[0].data.field2===v.label+' ( '+v.value+' )');
     if(matches.length!==1)throw Error('LGD_COLD_BINDING_VARIABLE');path=matches[0].value;source_variable=matches[0].name;
    }else path=read('edtFileName;ValueControl');
    return {path,source_variable,checksum:read('edtUseChecksum;ValueControl'),compression:read('edtCompression'),bitness:read('edtDDFSystem'),written_checksum:read('edtWrittenChecksum')};
   },{base:b.workflow_ref.prefix+';WizrdMCF;ImportNativePreviewWizard;',variables:${JSON.stringify(variables)}});
   const after=await (${readPreparedNodeContext.toString()})(page,b);
   if(JSON.stringify(before)!==JSON.stringify(after))throw Error('LGD_COLD_OWNER_CHANGED');return r;
  }`);
  if(values.checksum!==wanted.checksum||values.compression!==wanted.compression||values.written_checksum!==wanted.written_checksum
   ||wanted.bitness&&values.bitness!==wanted.bitness||wanted.filename&&!values.path.endsWith('-'+wanted.filename)||!/\.lgd$/i.test(values.path)
   ||(wanted.destination??expected.lgd.destination)&&values.path!==(wanted.destination??expected.lgd.destination)||expected.lgd.source_variable&&values.source_variable!==expected.lgd.source_variable
   ||expected.lgd.filename&&!values.path.endsWith('-'+expected.lgd.filename))throw Error('LGD_COLD_SOURCE_SETTINGS');
  const closed=await closePreparedWizard(channel);if(!closed.verified||closed.settings_applied!==false)throw Error('LGD_COLD_CANCEL');
  }else{
  await channel.openOutputPort(0);
  const mapping=await channel.observe({condition:'LGD cold saved output properties',readMappings:true,ready:s=>s.node_mapping?.verified&&s.node_mapping.inventory_complete});
  verifyLgdFields(mapping.node_mapping.target_fields,wanted.columns);
  const done=await closePreparedWizard(channel);if(!done.verified||done.settings_applied!==false)throw Error('LGD_COLD_MAPPING_CANCEL');
  }
 }
 if(!outputProperties&&expected.lgd.kind==='roundtrip'){
  const {observeExportDestinations}=await import('./static-source-proof.mjs');
  const ds=await observeExportDestinations({load,graph:{...graph,nodes:graph.nodes.filter(n=>n.type==='exports.lgd')},channelFor,execute});
  if(ds.length!==1||ds[0].destination!==expected.lgd.destination||ds[0].lgd_settings?.compression!==2||ds[0].lgd_settings?.checksum!==1)throw Error('LGD_COLD_EXPORT_SETTINGS');
  if(expected.lgd.binding&&ds[0].lgd_binding!==expected.lgd.binding)throw Error('LGD_COLD_DESTINATION_BINDING');
 }
 if(!outputProperties&&formats){
  const {observeExportDestinations}=await import('./static-source-proof.mjs');
  const ds=await observeExportDestinations({load,graph:{...graph,nodes:graph.nodes.filter(n=>n.type==='exports.lgd')},channelFor,execute});
  if(ds.length!==formats.length||!formats.every(f=>ds.filter(d=>d.destination===f.destination&&d.lgd_settings?.compression===f.native_compression&&d.lgd_settings?.checksum===f.native_checksum).length===1))throw Error('LGD_COLD_EXPORT_SETTINGS');
 }
 return true;
}
