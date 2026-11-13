import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeSupernodeContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readSupernodeContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readSupernodeBrowser.toString()})`;
}
export async function readSupernodeContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readSupernodeBrowser){
 const before=await readNode(page,binding);
 if(before.verified!==true||before.surface!=='wizard'||before.output_port||before.input_port)return {verified:false,reason:'supernode_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix);
 const after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'supernode_owner_changed'};
 return {...result,node_context:after};
}

// Read rendered cells of the complete local store. Do not load its proxy or
// infer a port from a caption elsewhere in the document.
export function readSupernodeBrowser(prefix){
 const fail=reason=>({verified:false,reason});
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const base=prefix+';WizrdMCF;GenericModelComponentWizard',roots=exact(base),grids=exact(base+';grdModelPorts');
 if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true})||grids.length!==1||!roots[0].contains(grids[0]))return fail('supernode_grid_root');
 if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('supernode_mask');
 const grid=globalThis.Ext?.getCmp?.(grids[0].id),store=grid?.getStore?.(),data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(grid?.el?.dom!==grids[0]||store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()
  ||!Array.isArray(records)||records.length>2||store.getCount?.()!==records.length
  ||source&&(source.length!==records.length||source.some(r=>!records.includes(r))))return fail('supernode_incomplete_store');
 const ports=[];
 for(const [index,r] of records.entries()){
  const row=grid.getView?.().getNode?.(r),id=String(r.internalId??'');
  if(!r.isModel||!id||!row||grid.getView().getRecord(row)!==r||!grids[0].contains(row))return fail('supernode_row_identity');
  const cell=name=>[...row.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid').startsWith(base+';')&&e.getAttribute('data-tid').split(';').at(-1).startsWith(name+'_'));
  const names=cell('colName'),labels=cell('colDisplayName'),types=cell('colType');
  if(names.length!==1||labels.length!==1||types.length!==1)return fail('supernode_cells:'+JSON.stringify(Object.keys(r.data??{})));
  const checks=row.querySelectorAll('.x-grid-checkcolumn');
  ports.push({index,record_id:id,name:names[0].textContent.trim(),label:labels[0].textContent.trim(),kind:types[0].textContent.trim(),
   optional:checks.length===1?checks[0].classList.contains('x-grid-checkcolumn-checked'):null,name_tid:names[0].getAttribute('data-tid')});
 }
 if(new Set(ports.map(p=>p.record_id)).size!==ports.length)return fail('supernode_duplicate_record');
 return {verified:true,inventory_complete:true,ports};
}
