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
  ||!Array.isArray(records)||records.length>4||store.getCount?.()!==records.length
  ||source&&(source.length!==records.length||source.some(r=>!records.includes(r))))return fail('supernode_incomplete_store');
 const ports=[];
 for(const r of records){
  const d=r.data;
  // GenericSocketModel inserts one non-data row for an empty group. Its
  // blank cells are not sockets and must never authorize an existing port.
  if(r.isNonData===true||r.isFakeInStore===true){
   if(r.isNonData!==true||r.isFakeInStore!==true||r.isCollapsedPlaceholder!==true
    ||d?.Name!==null||![0,1].includes(d.SocketType)||d.VendorGUID!==undefined)return fail('supernode_unknown_placeholder');
   continue;
  }
  const direction=d?.SocketType===0?'input':d?.SocketType===1?'output':null;
  const vendor=direction==='input'?'05969d66-64f2-4d9f-b714-a2c9821461db':'d2278de3-ce0b-407b-9839-c05d14a1debe';
  if(!direction||d.VendorGUID!==vendor||d.Caption!=='Таблица'||d.IsDerived===true
   ||typeof d.Name!=='string'||typeof d.DisplayName!=='string'||typeof d.Optional!=='boolean')return fail('supernode_port_type');
  const row=grid.getView?.().getNode?.(r),id=String(r.internalId??'');
  if(!r.isModel||!id||!row||grid.getView().getRecord(row)!==r||!grids[0].contains(row))return fail('supernode_row_identity');
  const cell=name=>[...row.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid').startsWith(base+';')&&e.getAttribute('data-tid').split(';').at(-1).startsWith(name+'_'));
  const names=cell('colName'),labels=cell('colDisplayName'),types=cell('colType');
  if(names.length!==1||labels.length!==1||types.length!==1)return fail('supernode_cells:'+JSON.stringify(Object.keys(r.data??{})));
  if((d.Name?names[0].textContent.trim()!==d.Name:names[0].textContent.trim()!=='<Уникальное>')
   ||labels[0].textContent.trim()!==d.DisplayName||types[0].textContent.trim()!==d.Caption)return fail('supernode_rendered_values');
  ports.push({direction,record_id:id,name:d.Name,label:d.DisplayName,kind:'table',optional:d.Optional,name_tid:names[0].getAttribute('data-tid')});
 }
 if(new Set(ports.map(p=>p.record_id)).size!==ports.length)return fail('supernode_duplicate_record');
 if(['input','output'].some(direction=>ports.filter(p=>p.direction===direction).length>1))return fail('supernode_boundary_count');
 return {verified:true,inventory_complete:true,ports:ports.sort((a,b)=>Number(a.direction==='output')-Number(b.direction==='output')).map((p,index)=>({index,...p}))};
}
