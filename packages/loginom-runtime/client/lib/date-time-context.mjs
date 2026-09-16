import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeDateTimeContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readDateTimeContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readDateTimeBrowser.toString()})`;}
export async function readDateTimeContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readDateTimeBrowser){
 const before=await readNode(page,binding);if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'date_time_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'date_time_node_changed'};
 return {...result,node_context:after};
}
// Read only the selected field's cached matrix. Other field matrices require a
// normal UI selection; never call the remote Functions object behind a record.
export function readDateTimeBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;DateReformWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1));if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('date_time_root');
 const grids=['grdColumns','grdDataFormat'].map(k=>exact(base+k));
 if(grids.some(g=>g.length!==1||!roots[0].contains(g[0])))return fail('date_time_grids');
 const cs=grids.map(g=>globalThis.Ext?.getCmp?.(g[0].id));if(cs.some((c,i)=>c?.el?.dom!==grids[i][0]))return fail('date_time_binding');
 const stores=cs.map(c=>c.getStore?.()),rs=[];
 for(const [i,s] of stores.entries()){const data=s?.getData?.(),items=data?.items,source=data?.getSource?.()?.items;
  const expected=source&&(i===0?source.filter(r=>r.data?.DataType===2):source);
  if(s?.$className!=='Ext.data.Store'||s.isBufferedStore||s.isLoading?.()||!Array.isArray(items)||items.length>1000||s.getCount?.()!==items.length
   ||expected&&(expected.length!==items.length||expected.some(r=>!items.includes(r))))return fail('date_time_inventory');rs.push(items);
 }
 const names=new Set(),ids=new Set(),fields=[];
 for(const r of rs[0]){const d=r.data,id=String(r.internalId);if(!r.isModel||d.DataType!==2||typeof d.Name!=='string'||!d.Name||names.has(d.Name)||ids.has(id)||typeof d.DisplayName!=='string'||!Number.isSafeInteger(d.Count)||d.Count<0||d.Count>116)return fail('date_time_field');
  names.add(d.Name);ids.add(id);fields.push({name:d.Name,label:d.DisplayName,type:'datetime',record_id:id,count:d.Count});}
 const selection=cs[0].getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selection)||selection.length!==1||!rs[0].includes(selection[0]))return fail('date_time_selection');
 const selected=fields[rs[0].indexOf(selection[0])],matrix=[],keys=new Set();
 for(const [index,r] of rs[1].entries()){const d=r.data,key=d.Func+':'+d.ISO8601;
  if(!r.isModel||!Number.isSafeInteger(d.Func)||d.Func<0||d.Func>18||typeof d.ISO8601!=='boolean'||keys.has(key)
   ||!['DoDateTimeFirst','DoDateTimeLast','DoNumber','DoString'].every(k=>typeof d[k]==='boolean')||typeof d.StringFmt!=='string')return fail('date_time_matrix_record');keys.add(key);
  matrix.push({index,record_id:String(r.internalId),func:d.Func,iso:d.ISO8601,first:d.DoDateTimeFirst,last:d.DoDateTimeLast,number:d.DoNumber,string:d.DoString,string_format:d.StringFmt});
 }
 if(matrix.length!==29||matrix.filter(r=>!r.iso).length!==19)return fail('date_time_matrix_coverage');
 const count=matrix.reduce((n,r)=>n+['first','last','number','string'].filter(k=>r[k]).length,0);
 return {verified:true,inventory_complete:true,state_source:'cached_selected_date_time_matrix',fields,selected,matrix,
  selected_count:count,native_count_consistent:count===selected.count,settings_applied:false};
}
