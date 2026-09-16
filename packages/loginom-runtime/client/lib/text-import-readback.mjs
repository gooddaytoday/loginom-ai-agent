// Public, bounded projection of verified UI receipts. Never derive these values
// from requested settings: an empty existing-node patch must still expose them.
const requireValue=(value,message)=>{if(!value)throw new Error('Import readback: '+message);};
const pick=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]]));
export function textImportConfigurationReadback({node,phases,operation_id}) {
  const receipt=name=>{
    const matches=phases.filter(p=>p.phase===name);
    requireValue(matches.length===1,'unique '+name+' receipt required');
    const p=matches[0];
    requireValue(p.status==='verified'&&p.receipt_id===operation_id+':'+name
      &&p.value?.verified===true&&p.value.cleanup_complete===true,'unverified '+name+' receipt');
    return p;
  };
  const configured=receipt('configure'),mapped=receipt('output_mapping'),finished=receipt('finish');
  requireValue(finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode),
    'settings were not applied');
  const c=configured.value,m=mapped.value,n=m.native_mapping;
  const fields=(group,names)=>Object.fromEntries(names.map(name=>{
    const f=group?.fields?.[name];
    requireValue(f?.status==='observed'&&f.truncated!==true
      &&(typeof f.value==='string'||typeof f.value==='boolean'),'missing complete '+name);
    requireValue(typeof f.value!=='string'||f.value.length<=2048,'oversized '+name);
    return [name,f.value];
  }));
  const source=fields(c.source,['source_path','connection','encoding','rows_to_skip','first_line_as_title']);
  const format=fields(c.format,['delimiter','text_qualifier','null_marker','decimal_separator']);
  requireValue(typeof source.first_line_as_title==='boolean'
    &&Object.entries(source).every(([k,v])=>k==='first_line_as_title'||typeof v==='string')
    &&Object.values(format).every(v=>typeof v==='string'),'invalid observed field types');
  requireValue(Array.isArray(c.columns)&&c.columns.length>0&&c.columns.length<=1000
    &&c.columns.every((f,i)=>f.status==='observed'&&f.index===i&&typeof f.used==='boolean'
      &&['name','label','type','data_kind'].every(k=>typeof f[k]==='string'&&f[k].length<=120))
    &&new Set(c.columns.map(f=>f.name)).size===c.columns.length,'incomplete columns');
  requireValue(n?.verified===true&&n.source_identity_verified===true&&n.inventory_complete===true
    &&m.source_identity_verified===true&&typeof n.autosync==='boolean'
    &&Array.isArray(n.source_fields)&&Array.isArray(n.target_fields)
    &&n.target_fields.length<=1000,'unverified mapping inventory');
  const output=n.target_fields.map((f,i)=>{
    const matches=n.source_fields.filter(s=>s.record_id===f.source?.record_id);
    requireValue(matches.length===1&&JSON.stringify(matches[0])===JSON.stringify(f.source)
      &&f.index===i&&['name','label','type','data_kind'].every(k=>typeof f[k]==='string'&&f[k].length<=120),
      'mapping source differs');
    return {...pick(f,['index','name','label','type','data_kind']),source_name:f.source.name};
  });
  requireValue(output.length===c.columns.filter(f=>f.used).length,'output inventory differs');
  return {kind:'text_import',scope:'observed_before_verified_finish',node:structuredClone(node),
    receipt_ids:[configured.receipt_id,mapped.receipt_id,finished.receipt_id],
    values_are:'observed_ui_values',source,format,
    columns:c.columns.map(f=>pick(f,['index','name','label','type','data_kind','used'])),
    output_mapping:{port:0,autosync:n.autosync,fields:output},
    package_persistence_verified:false};
}
