import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeUnionContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readUnionContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readUnionBrowser.toString()})`;
}
export async function readUnionContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readUnionBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'union_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'union_node_changed'};
 return {...result,node_context:after};
}

// Complete local wizard stores only. Never dereference FEngine, FLinks or
// record.data.$self: those objects are RPC proxies, not observed UI evidence.
export function readUnionBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;UnionDataWizard';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base);
 if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('union_root');
 const cmp=k=>{const es=exact(base+(k?';'+k:''));if(es.length!==1||!roots[0].contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const owner=cmp('')?.['@@TestCmpController'],ws=exact(prefix+';WizrdMCF');
 const wizard=ws.length===1?globalThis.Ext?.getCmp?.(ws[0].id)?.Controller:null;
 if(owner?.constructor?.name!=='UnionDataWizard'||!wizard||owner.FWizardForm!==wizard||owner.FColumnsPrepared!==true)return fail('union_owner_or_pending');
 const joined=owner.FJoinedColumnStores,main=owner.FMainColumnStore;
 if(!Array.isArray(joined)||joined.length<1||joined.length>31||new Set([main,...joined]).size!==joined.length+1
  ||cmp('grdUnionData')?.getStore?.()!==main||cmp('grdUnionData;grd')?.getStore?.()!==main||cmp('grdUnionData;grd-1')?.getStore?.()!==main)return fail('union_stores_owner');
 const inventories=[];
 for(const [port,store] of [main,...joined].entries()){
  const data=store?.getData?.(),rows=data?.items,source=data?.getSource?.()?.items;
  const full=port>0&&Array.isArray(source)?source:rows;
  if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||store.isSyncing
   ||store.getProxy?.()?.$className!=='bg.ext.CollectionProxy'||store.getRemoteFilter?.()!==false||store.getRemoteSort?.()!==false
   ||!Array.isArray(rows)||!Array.isArray(full)||full.length>1000||store.getCount()!==rows.length||store.getTotalCount()!==full.length
   ||source&&(!Array.isArray(source)||new Set(source).size!==source.length||rows.some(r=>!source.includes(r))||port===0&&source.length!==rows.length))return fail('union_inventory');
  inventories.push(full);
 }
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[];
 for(const [port,rows] of inventories.entries()){
  const names=new Set(),ids=new Set(),indices=new Set(),out=[];
  for(const r of rows){const d=r?.data,id=String(r?.internalId??'');
   if(!r?.isModel||!id||ids.has(id)||!Number.isSafeInteger(d?.Index)||d.Index<0||d.Index>=rows.length||indices.has(d.Index)
    ||typeof d.Name!=='string'||!d.Name||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'||!types[d.DataType]
    ||port>0&&(d.Value!==d.Index||!Number.isSafeInteger(d.Link)||d.Link< -1||d.Link>=inventories[0].length))return fail('union_field');
   names.add(d.Name.toLowerCase());ids.add(id);indices.add(d.Index);
   out.push({record_id:id,index:d.Index,name:d.Name,label:d.DisplayName,type:types[d.DataType]});
  }fields.push(out.sort((a,b)=>a.index-b.index));
 }
 const mappings=[];
 for(let port=1;port<inventories.length;port++){
  const check='chk'+port,value='col'+port;
  if(owner.FLinkAssignedProps?.[port-1]!==check||owner.FLinkValueProps?.[port-1]!==value)return fail('union_link_properties');
  const used=new Set(),pairs=[];
  for(const r of inventories[0]){
   const d=r.data;
   if(typeof d[check]!=='boolean'||!Number.isSafeInteger(d[value])||(!d[check]&&d[value]!==-1))return fail('union_link_state');
   if(!d[check])continue;
   const matches=inventories[port].filter(t=>t.data.Value===d[value]),target=matches[0];
   if(matches.length!==1||used.has(target)||target.data.Link!==d.Index||target.data.DataType!==d.DataType)return fail('union_link');
   used.add(target);pairs.push({main:d.Name,source:target.data.Name,main_index:d.Index,source_index:target.data.Index});
  }
  if(inventories[port].some(r=>r.data.Link!==-1&&!used.has(r)))return fail('union_reverse_link');
  mappings.push({port,pairs:pairs.sort((a,b)=>a.main_index-b.main_index),unmatched:fields[port].filter(f=>!pairs.some(p=>p.source_index===f.index)).map(f=>f.name)});
 }
 const use=cmp('cntUsePrefixes;cnt;chb')?.getValue?.(),values={};
 const useProperty=cmp('pedUsePrefixes')?.Controller;
 if(typeof use!=='boolean'||!useProperty||useProperty.FInitializing||useProperty.FLastViewMode!==0||useProperty.FLastValue!==use||cmp('pedUsePrefixes;ValueControl')?.getValue?.()!==use)return fail('union_prefix_flag');
 for(const key of ['pedNamePrefix','pedDisplayNamePrefix']){
  const property=cmp(key)?.Controller,value=cmp(key+';ValueControl')?.getValue?.();
  if(!property||property.FInitializing||property.FLastViewMode!==0||property.FLastValue!==value||typeof value!=='string')return fail('union_prefix_or_variable');
  values[key]=value;
 }
 const plugin=cmp('grdUnionData;grd-1')?.editingPlugin;
 let editor=null;
 if(plugin?.editing===true){
  const context=plugin.context,active=plugin.activeEditor,field=active?.field;
  const port=owner.FLinkValueProps.indexOf(context?.field)+1,record=context?.record;
  const root=active?.el?.dom,rootTid=root?.getAttribute('data-tid'),picker=field?.picker?.el?.dom;
  if(port<1||context.column?.dataIndex!==context.field||!inventories[0].includes(record)
   ||field?.getStore?.()!==joined[port-1]||!rootTid?.startsWith(base+';grdUnionData;grd-1;tbl;celleditor')
   ||exact(rootTid).length!==1||active.isVisible?.()!==true||field.el?.dom?.getAttribute('data-tid')!==rootTid+';cbx')return fail('union_editor_owner');
  const pickerTid=picker?.getAttribute('data-tid');
  if(picker&&pickerTid!==rootTid+';cbx;boundlist')return fail('union_picker_owner');
  editor={port,main:record.data.Name,record_id:String(record.internalId),root_tid:rootTid,
   choices_tid:picker&&field.picker.isVisible?.()===true?pickerTid:null};
 }
 return {verified:true,inventory_complete:true,state_source:'cached_union_stores',input_fields:fields,mappings,
  prefixes:{enabled:use,name:values.pedNamePrefix,label:values.pedDisplayNamePrefix},editor,settings_applied:false};
}
