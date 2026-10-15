import {readTableFormatDefinitions,revealTableFormatField} from './table-format-pages.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=['formatting','custom','format_string','thousands','scientific','decimal_digits','currency'];
const settings=f=>{
 need(keys.every(k=>f?.[k]?.status==='observed'),'Individual numeric format settings unavailable');
 const s=Object.fromEntries(keys.map(k=>[k,f[k].value]));
 need(['formatting','custom','thousands','scientific'].every(k=>typeof s[k]==='boolean')
  &&['format_string','decimal_digits','currency'].every(k=>typeof s[k]==='string'&&s[k].length<240&&!s[k].includes('\0')),'Invalid numeric format settings');
 return s;
};
const selected=s=>s.table_settings?.format?.selected_group??s.table_settings?.format?.selected_numeric;
const ids=fs=>fs.map(f=>f.record_id).sort();

// Internal wide numeric path. Original flags are never inferred from a mask or
// another field: every field is first selected and observed individually.
export async function configureWideNumericFormats(channel,table,definition,fields,{restore,verifyNumeric}){
 const dialog={table,kind:'format'};let offset=0,s;
 const read=(condition,ready=()=>true)=>channel.observe({condition,tableDialog:dialog,tableFormatPage:{offset,limit:8},ready:s=>
  s.table_settings?.status==='observed'&&s.table_settings.kind==='format'&&s.table_settings.format?.page?.schema_id===definition.schema_id&&ready(s)});
 const action=(condition,resolve,identity)=>{
  const before=ids(s.table_settings.format.selection?.fields??[]);
  return channel.perform({condition,initialObservation:s,
   ready:s=>s.table_settings?.format?.page?.schema_id===definition.schema_id&&s.table_settings.format.selection?.complete===true
    &&same(ids(s.table_settings.format.selection.fields),before),resolve,
   identity:s=>({table,...identity,selection:ids(s.table_settings.format.selection.fields),
    previous:keys.map(k=>({key:k,status:selected(s)?.[k]?.status,value:selected(s)?.[k]?.value}))})});
 };
 const native=t=>definition.fields.find(f=>f.index===t.definition_index);
 const one=xs=>{need(xs.length===1,'Unique owned Table format control required');return xs[0];};
 const selectOne=async t=>{
  offset=Math.floor(t.definition_index/8)*8;s=await revealTableFormatField(channel,table,definition,native(t));
  await action('select individual original format',s=>({verb:'click',ref:one(s.ui.elements.filter(e=>e.table_field?.source_index===t.index&&e.table_field.name_key===t.key)).ref}),{field:t});
  s=await read('individual numeric format observed',s=>s.table_settings.format.selected_numeric?.source_index===t.index
   &&s.table_settings.format.selected_numeric.name_key===t.key&&s.table_settings.format.selection?.complete===true
   &&s.table_settings.format.selection.fields.length===1);
 };
 const originals=[];
 if(restore){
  need(Array.isArray(restore)&&restore.length===fields.length,'Complete original numeric formats required');
  need(new Set(restore.map(f=>f.index)).size===fields.length,'Duplicate original numeric format');
  for(const t of fields){const f=restore.find(f=>f.index===t.index&&f.key===t.key&&f.type===t.type);
   need(f&&keys.every(k=>Object.hasOwn(f.settings,k)),'Original numeric format identity changed');
   settings(Object.fromEntries(keys.map(k=>[k,{status:'observed',value:f.settings[k]}])));
   need(native(t).format_string===(t.type==='integer'?'0':'0.################E+00'),'Exact numeric format changed before restoration');
  }
 }else for(const [at,t] of fields.entries()){
  // Paint a whole page before its individual reads; otherwise revealing only
  // the next bottom row scrolls once per field on a virtualized list.
  if(at%8===0)await revealTableFormatField(channel,table,definition,native(fields[Math.min(fields.length-1,at+7)]));
  await selectOne(t);originals.push({index:t.index,key:t.key,type:t.type,settings:settings(selected(s))});
 }
 const groups=new Map();
 for(const t of fields){
  const original=restore?.find(f=>f.index===t.index&&f.key===t.key&&f.type===t.type);
  const desired=original?.settings??{formatting:true,custom:true,format_string:t.type==='integer'?'0':'0.################E+00'};
  const initial=restore?null:originals.find(f=>f.index===t.index).settings;
  const key=JSON.stringify([t.type,desired,initial]);if(!groups.has(key))groups.set(key,{targets:[],desired,initial});groups.get(key).targets.push(t);
 }
 const selectGroup=async targets=>{
  let reset=true;const expected=[];
  for(let at=0;at<targets.length;){
   const t=targets[at];offset=Math.floor(t.definition_index/8)*8;
   const last=targets.slice(at).findLast(t=>t.definition_index<offset+8);
   // Reveal the end of this metadata page so the normal 8-row batch is painted,
   // rather than scrolling once for each subsequent offscreen member.
   s=await revealTableFormatField(channel,table,definition,native(last));
   if(!s.table_settings.format.fields.some(f=>f.record_id===native(t).record_id))
     s=await revealTableFormatField(channel,table,definition,native(t));
   const page=s.table_settings.format.fields;
   const batch=targets.slice(at).filter(t=>page.some(f=>f.record_id===native(t).record_id&&f.status==='observed')).slice(0,8);
   // Never skip a not-yet-rendered member and reorder the intended set.
   let count=0;while(count<batch.length&&batch[count]===targets[at+count])count++;
   need(count>0,'Numeric group selection made no progress');const next=batch.slice(0,count);
   const refs=next.map(t=>one(page.filter(f=>f.record_id===native(t).record_id)).label_ref);
   const receipt=await channel.selectTableFormatGroup(table,refs,reset);need(receipt.verified&&receipt.cleanup_complete,'Numeric group selection unconfirmed');
   expected.push(...next.map(native));at+=count;reset=false;
   s=await read('numeric group members confirmed',s=>s.table_settings.format.selection?.complete===true&&same(ids(s.table_settings.format.selection.fields),ids(expected)));
  }
  return s;
 };
 const verified=[];
 for(const {targets,desired,initial} of groups.values()){
  await selectGroup(targets);
  const current=settings(selected(s));
  if(!restore)need(same(current,initial),'Individual original format changed before editing');
  else for(const t of targets)verifyNumeric({...selected(s),source_index:t.index,name_key:t.key},t);
  if(restore){const current=settings(selected(s));originals.push(...targets.map(t=>({index:t.index,key:t.key,type:t.type,settings:{...current}})));}
  for(const name of ['formatting','custom'])if(selected(s)?.[name]?.value!==true){
   await action('enable grouped Table '+name,s=>{const c=selected(s)[name];return {verb:'set_checked',checked:true,ref:one(s.ui.elements.filter(e=>[c.input_ref,c.display_ref].includes(e.ref)&&e.allowed_actions.includes('set_checked'))).ref};},{targets,name});
   s=await read('grouped Table '+name+' enabled',s=>selected(s)?.[name]?.value===true);
  }
  await action('set grouped exact numeric mask',s=>({verb:'fill',ref:selected(s).format_string.input_ref,text:desired.format_string}),{targets,mask:desired.format_string});
  s=await read('grouped numeric mask draft',s=>selected(s)?.format_string?.value===desired.format_string);
  await action('commit grouped numeric mask',s=>({verb:'press',ref:selected(s).format_string.input_ref,key:'Tab'}),{targets,mask:desired.format_string});
  s=await read('grouped numeric mask committed',s=>selected(s)?.format_string?.value===desired.format_string);
  if(restore)for(const name of ['custom','formatting'])if(selected(s)?.[name]?.value!==desired[name]){
   await action('restore grouped Table '+name,s=>{const c=selected(s)[name];return {verb:'set_checked',checked:desired[name],ref:one(s.ui.elements.filter(e=>[c.input_ref,c.display_ref].includes(e.ref)&&e.allowed_actions.includes('set_checked'))).ref};},{targets,name,value:desired[name]});
   s=await read('grouped original '+name+' restored',s=>selected(s)?.[name]?.value===desired[name]);
  }
  // Leave the selection to commit its stored model, then rebuild the exact
  // group. Reading the just-typed input alone cannot attest stored formats.
  await selectOne(fields.find(t=>!targets.includes(t))??targets[0]);
  await selectGroup(targets);
  const common=selected(s);settings(common);
  for(const t of targets){
   if(restore)need(keys.every(k=>common[k].value===desired[k]),'Stored original numeric flags differ');
   else verified.push({...t,mask:desired.format_string,verified_format:verifyNumeric({...common,source_index:t.index,name_key:t.key},t)});
  }
  const stored=await readTableFormatDefinitions(channel,table);
  need(stored.schema_id===definition.schema_id,'Numeric format schema changed during readback');
  for(const t of targets){const f=stored.fields.find(f=>f.record_id===native(t).record_id);
   need(f?.format_string===desired.format_string,'Individual stored numeric mask differs');}
  // readTableFormatDefinitions leaves its last page as the fresh observation.
  offset=Math.floor(targets[0].definition_index/8)*8;
  s=await read('bound numeric group after stored readback',s=>s.table_settings.format.selection?.complete===true&&same(ids(s.table_settings.format.selection.fields),ids(targets.map(native))));
 }
 await action('apply bound grouped numeric format',s=>({verb:'click',ref:one(s.ui.elements.filter(e=>e.tid===table.table_tid+';ModalWindow_BrowseFormat;btnApply')).ref}),{fields});
 await channel.observe({condition:'grouped Table format dialog closed',tableDialog:dialog,readOutputs:true,ready:s=>s.ui.dialogs.length===0&&s.node_outputs?.tables?.some(t=>t.active&&t.view_guid===table.view_guid)});
 return {table,fields,numeric_formats:restore?fields:verified,datetime_formats:[],original_formats:originals,
  restored:restore!==null,dialog_readback_verified:true,format_application_pending:false,values_verified:false,grouped_numeric:true};
}
