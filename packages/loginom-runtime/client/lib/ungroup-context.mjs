import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeUngroupContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readUngroupContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readUngroupBrowser.toString()})`;}
export async function readUngroupContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readUngroupBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'ungroup_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'ungroup_node_changed'};
 return {...result,node_context:after};
}
// Only complete local stores and property-editor caches; never engine/FLinks RPC proxies.
export function readUngroupBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;UngroupDataWizard';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base);
 if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('ungroup_root');
 const cmp=k=>{const es=exact(base+(k?';'+k:''));if(es.length!==1||!roots[0].contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const owner=cmp('')?.['@@TestCmpController'],ws=exact(prefix+';WizrdMCF');
 const wizard=ws.length===1&&globalThis.Ext?.getCmp?.(ws[0].id)?.Controller;
 if(owner?.constructor?.name!=='UngroupDataWizard'||!wizard||owner.FWizardForm!==wizard||owner.FMissingLinks!==false)return fail('ungroup_owner_or_pending');
 const fields=[],records=[];
 for(const [port,grid] of ['grdUngroupColumns','grdSupportColumns'].entries()){
  const s=cmp(grid)?.getStore?.(),data=s?.getData?.(),rs=data?.items,source=data?.getSource?.()?.items;
  if(s!==owner[port?'FSupportColumnsStore':'FColumnsStore']||s?.$className!=='Ext.data.Store'||s.isBufferedStore||s.isLoading?.()||s.isSyncing
   ||s.getProxy?.()?.$className!=='bg.ext.CollectionProxy'||!Array.isArray(rs)||rs.length>1000||s.getCount()!==rs.length||s.getTotalCount()!==rs.length
   ||cmp(port?'txtSupportFilterField':'txtUngroupFilterField')?.getValue?.()!==''
   ||source&&(source.length!==rs.length||new Set(source).size!==rs.length||source.some(r=>!rs.includes(r))))return fail('ungroup_inventory');
  const ids=new Set(),names=new Set(),types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string'},out=[];
  for(const [index,r] of rs.entries()){
   const d=r?.data,id=String(r?.internalId??'');
   if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'||!types[d.DataType]
    ||d.Index!==index||!Number.isInteger(d.LinkIndex)||d.LinkIndex< -1||d.LinkName!==''||d.GroupField!==''||!(port?[0,4,6,9]:[0,6,7]).includes(d.UsageType))return fail('ungroup_field');
   ids.add(id);names.add(d.Name.toLowerCase());out.push({record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],index,usage:d.UsageType,link_index:d.LinkIndex});
  }fields.push(out);records.push(rs);
 }
 const keys=[];
 for(const f of fields[0]){
  if(f.link_index===-1)continue;
  const other=fields[1][f.link_index];
  if(!other||other.link_index!==f.index||other.type!==f.type||f.usage!==6||other.usage!==6)return fail('ungroup_link');
  keys.push({total:f.name,support:other.name});
 }
 if(fields[1].some(f=>f.link_index>=0&&!keys.some(k=>k.support===f.name)))return fail('ungroup_reverse_link');
 const values={};
 for(const key of ['pedUngroupMethod','pedRoundFormat','pedRoundParam','pedBalanceMethod']){
  const c=cmp(key+';ValueControl'),p=cmp(key)?.Controller,value=c?.getValue?.();
  if(!p||p.FInitializing||p.FLastViewMode!==0||p.FLastVariable!=null||p.FLastValue!==value||!Number.isInteger(value)
   ||(key==='pedUngroupMethod'?![0,1,2].includes(value):key==='pedRoundFormat'?![0,1,2].includes(value):key==='pedBalanceMethod'?![0,1,2,3].includes(value):value<0||value>2147483647))return fail('ungroup_option_or_variable');
  values[key]=value;
 }
 const selected=fields.map((_,i)=>{const rs=cmp(i?'grdSupportColumns':'grdUngroupColumns').getSelectionModel?.()?.getSelection?.();return Array.isArray(rs)&&rs.every(r=>records[i].includes(r))?rs.map(r=>String(r.internalId)):null;});
 if(selected.some(s=>!s))return fail('ungroup_selection');
 const roles=(port,usage)=>fields[port].filter(f=>f.usage===usage).map(f=>f.name);
 const rounding={format:['none','multiple','precision'][values.pedRoundFormat],...(values.pedRoundFormat?{value:values.pedRoundParam}:{})};
 return {verified:true,inventory_complete:true,state_source:'cached_ungroup_stores',input_fields:fields,selected_records:selected,
  method:['shares','computed','seasonal'][values.pedUngroupMethod],ungroup:{keys,value_fields:roles(0,7),item_fields:roles(1,4),share_fields:roles(1,9),rounding,balance:['none','last','proportional','equal'][values.pedBalanceMethod]},settings_applied:false};
}
