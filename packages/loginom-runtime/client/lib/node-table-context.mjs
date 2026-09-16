import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {readOutputContext} from './node-output-context.mjs';

export function makeNodeTableContextCode(binding,table,page) {
  validatePreparedNodeContext(binding);
  if(!table||Object.keys(table).sort().join(',')!=='port_guid,table_tid,view_guid'
    ||!['port_guid','view_guid'].every(k=>typeof table[k]==='string'&&/^[a-f0-9-]{36}$/i.test(table[k]))
    ||typeof table.table_tid!=='string'||!table.table_tid.startsWith(binding.workflow_ref.prefix+';ViewsForm;BrowseView'))throw Error('Bound Table identity required');
  if(!page||Object.keys(page).sort().join(',')!=='column_limit,column_offset,row_limit,row_offset'
    ||!['column_offset','row_offset'].every(k=>Number.isSafeInteger(page[k])&&page[k]>=0)
    ||!Number.isInteger(page.column_limit)||page.column_limit<1||page.column_limit>8
    ||!Number.isInteger(page.row_limit)||page.row_limit<0||page.row_limit>10)throw Error('Bounded Table page required');
  return `async page=>{const readNode=${readPreparedNodeContext.toString()},readOutputs=${readOutputContext.toString()};return (${readNodeTable.toString()})(page,${JSON.stringify(binding)},${JSON.stringify(table)},${JSON.stringify(page)},readOutputs,readNode)}`;
}

// Read only the Table's cached UI strings, never its dataset/RPC proxies. Each
// value must also match a rendered cell in the same native record and column.
// In particular, ValueText distinguishes empty text from a literal NBSP while
// preserving the exact user-visible numeric format (not an unformatted value).
export async function readNodeTable(page,binding,table,request,readOutputs=readOutputContext,readNode=readPreparedNodeContext) {
  const before=await readOutputs(page,binding,readNode);
  if(before.verified!==true||before.tables?.filter(t=>t.active&&t.view_guid===table.view_guid&&t.port_guid===table.port_guid&&t.table_tid===table.table_tid).length!==1)
    return {verified:false,reason:'active_table_binding'};
  const result=await page.evaluate(({table,request})=>{
    const fail=(reason,extra={})=>({verified:false,reason,...extra});
    const own=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value;
    const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    const visible=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
    const roots=exact(table.table_tid);if(roots.length!==1||!visible(roots[0]))return fail('table_root');
    const root=roots[0],model=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
    const desc=model?.FViewDescList?.[table.view_guid],base=desc?.BaseView;
    if(base?.FView?.el?.dom!==root||base.FStatus!==4)return fail('table_not_ready');
    if([...document.querySelectorAll('.x-mask-msg,.bg-mask-message')].some(visible))return fail('table_masked');
    const grids=['grdData;grd;tbl','grdData;grd-1;tbl'].map(s=>exact(table.table_tid+';'+s));
    if(grids.some(xs=>xs.length!==1||!root.contains(xs[0])||!visible(xs[0])))return fail('table_grids');
    const views=grids.map(xs=>globalThis.Ext?.getCmp?.(xs[0].id)),store=views[0]?.getStore?.();
    if(store?.$className!=='Ext.data.BufferedStore'||store.isLoading?.()||views.some((v,i)=>v?.el?.dom!==grids[i][0]||v.getStore?.()!==store))return fail('table_store');
    const source=base.FBrowseViewDataSourceController,paging=base.FBrowseViewDataProxyController;
    if(source?.FDataStore!==store||paging?.constructor?.name!=='BrowseViewPagingProxy'
      ||own(paging,'FViewDataInvalid')!==false||own(paging,'FRequiredPrepareViewData')!==false)return fail('table_data_binding');
    const total=own(paging,'FTotalRowCount'),segment=own(paging,'FPageIndex'),size=own(paging,'FPageSize'),cachedTotal=own(store,'totalCount');
    if(![total,segment,size,cachedTotal].every(Number.isSafeInteger)||total<0||segment<0||size<=0
      ||cachedTotal!==Math.min(size,Math.max(0,total-segment*size)))return fail('table_total');
    const rowStart=segment*size;
    if(request.row_offset<rowStart||request.row_offset>rowStart+cachedTotal||request.row_offset>total)return fail('table_segment_required',{row_start:rowStart,row_total:total});
    const names=own(base.FBrowseViewColumnsController,'FColumnNames'),headers=views[1].headerCt?.getGridColumns?.();
    if(!Array.isArray(names)||names.length>1000||new Set(names).size!==names.length||names.some(n=>typeof n!=='string'||!n||n.length>256)
      ||!Array.isArray(headers)||headers.length!==names.length||new Set(headers.map(c=>c.dataIndex)).size!==names.length
      ||headers.some((c,i)=>c.dataIndex!==names[i]))return fail('table_schema');
    if(request.column_offset>names.length)return fail('column_page_range');
    const definitions=[],types={dtInteger:'integer',dtFloat:'real',dtString:'string',dtBoolean:'boolean',dtDateTime:'datetime',dtVariant:'variant'};
    const headerRoot=exact(table.table_tid+';normalHeaderCt');
    if(headerRoot.length!==1||views[1].headerCt.el?.dom!==headerRoot[0])return fail('table_header_binding');
    for(const [index,c] of headers.entries()) {
      const el=c.el?.dom,tid=el?.getAttribute('data-tid'),classes=(el?.getAttribute('class')??'').split(/\s+/);
      const found=classes.filter(c=>/^bg-TBGDataType-dt\w+-before$/.test(c)).map(c=>types[c.slice(15,-7)]);
      if(!el||!headerRoot[0].contains(el)||!tid?.startsWith(table.table_tid+';normalHeaderCt;')||exact(tid).length!==1
        ||found.length!==1||!found[0]||el.textContent.length>2048)return fail('table_column_identity');
      definitions.push({index,name:c.dataIndex,label:el.textContent,type:found[0],header_tid:tid});
    }
    // A sole selected field commits its model only on Apply. Read that
    // closed, applied UI model through the same bound Table; never reopen it
    // or consult the dataset/FViewColumns RPC proxy.
    let appliedFormat;
    if(names.length===1) {
      const controller=base.FBrowseViewColumnsController,modal=own(controller,'FBrowseFormatModal'),form=own(controller,'FBrowseFormat');
      const modalRoot=modal?.FView?.el?.dom,formRoot=form?.FView?.el?.dom;
      const modalTid=table.table_tid+';ModalWindow_BrowseFormat',gridTid=modalTid+';BrowseFormat;grdFields;tbl',found=exact(gridTid);
      const grid=found.length===1?found[0]:null,view=grid?globalThis.Ext?.getCmp?.(grid.id):null,formatStore=view?.getStore?.();
      if(own(modal,'FResult')==='ok'&&own(form,'FInitialized')===true
        &&exact(modalTid).length===1&&exact(modalTid)[0]===modalRoot&&modalRoot.classList.contains('x-hidden-offsets')
        &&formRoot?.getAttribute('data-tid')===modalTid+';BrowseFormat'&&modalRoot.contains(formRoot)&&formRoot.contains(grid)
        &&view?.el?.dom===grid&&formatStore?.$className==='Ext.data.Store'&&!formatStore.isLoading?.()&&formatStore.getCount?.()===1) {
        const records=formatStore.getData?.()?.items,record=Array.isArray(records)&&records.length===1?records[0]:null,data=own(record,'data');
        const mask=own(data,'DisplayFormat'),type={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'}[own(data,'DataType')];
        if(record?.isModel===true&&own(data,'Index')===0&&own(data,'SourceColumnIndex')===0&&own(data,'Name')===names[0]
          &&own(data,'InGrid')===true&&type===definitions[0].type&&typeof mask==='string'&&mask.length<=256)
          appliedFormat={verified:true,table:{...table},source:'applied_table_format_ui_cache',modal_tid:modalTid,
            result:'ok',fields:[{index:0,key:names[0],type,mask}]};
      }
    }
    const schemaSymbol=Symbol.for('loginom-dock.table-schema.v1');
    const schemaState=globalThis[schemaSymbol]??(globalThis[schemaSymbol]={sequence:0});
    const signature=JSON.stringify(definitions);
    if(schemaState.root!==root||schemaState.store!==store||schemaState.signature!==signature)Object.assign(schemaState,
      {root,store,signature,id:'table-schema-'+(++schemaState.sequence)});
    const schemaId=schemaState.id,fields=definitions.slice(request.column_offset,request.column_offset+request.column_limit);
    const nulls=exact(table.table_tid+';btnDataGridShowNulls');
    if(nulls.length!==1||!root.contains(nulls[0])||!nulls[0].classList.contains('x-btn-pressed'))return fail('null_display_required');
    const rows=grids.map(xs=>[...xs[0].querySelectorAll('table.x-grid-item')]);
    if(rows.some(xs=>xs.length>200||new Set(xs.map(r=>r.getAttribute('data-recordid'))).size!==xs.length))return fail('table_render_bound');
    const inside=(cell,grid)=>{
      const c=cell.getBoundingClientRect(),g=grid.getBoundingClientRect();
      return visible(cell)&&c.x>=Math.max(0,g.x)-1&&c.y>=Math.max(0,g.y)-1
        &&c.x+c.width<=Math.min(globalThis.innerWidth,g.x+g.width)+1&&c.y+c.height<=Math.min(globalThis.innerHeight,g.y+g.height)+1;
    };
    const cache=own(store,'data'),pageSize=own(cache,'_pageSize'),map=own(cache,'map');
    if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000||!map)return fail('table_cache');
    const count=Math.min(request.row_limit,total-request.row_offset,rowStart+cachedTotal-request.row_offset),values=[];
    for(let offset=0;offset<count;offset++) {
      const index=request.row_offset-rowStart+offset,pageNumber=Math.floor(index/pageSize)+1;
      const entries=own(own(map,String(pageNumber)),'value');
      if(!Array.isArray(entries)||entries.length>pageSize)return fail('row_page_not_cached');
      const record=entries[index%pageSize],data=own(record,'data'),recordId=String(own(record,'internalId')??'');
      if(record?.isModel!==true||!recordId||own(data,'$RowIndex')!==index)return fail('cached_row_identity');
      const pair=rows.map(xs=>xs.filter(r=>r.getAttribute('data-recordid')===recordId));
      if(pair.some((xs,i)=>xs.length!==1||xs[0].getAttribute('data-recordindex')!==String(index)
        ||xs[0].getAttribute('data-boundview')!==grids[i][0].id))return fail('row_not_rendered');
      const cells=[];
      for(const field of fields) {
        // Ext recycles rendered rows: the test-id suffix can retain a render
        // index different from data-recordindex. The native record/row binding
        // above supplies row identity; the exact header prefix supplies field
        // identity. Suffixes can also repeat in other recycled rows, so require
        // uniqueness within this verified record row, not across the document.
        // Never choose a cell by its current screen position.
        const prefix=field.header_tid+'_';
        const els=[...pair[1][0].querySelectorAll('[data-tid]')].filter(e=>{
          const tid=e.getAttribute('data-tid');return tid?.startsWith(prefix)&&/^\d+$/.test(tid.slice(prefix.length));
        });
        const cached=own(data,field.name),props=cached&&Object.getOwnPropertyDescriptors(cached);
        if(!props||Object.getPrototypeOf(cached)!==Object.prototype||Object.values(props).some(d=>!('value'in d)))return fail('cell_cache_shape');
        if(els.length!==1)return fail('cell_not_visible',{schema_id:schemaId,column_index:field.index,row_index:request.row_offset+offset});
        if(!inside(els[0],grids[1][0])) {
          const c=els[0].getBoundingClientRect(),g=grids[1][0].getBoundingClientRect(),grid=grids[1][0];
          return fail('cell_not_visible',{schema_id:schemaId,column_index:field.index,row_index:request.row_offset+offset,
            horizontal_window:{table:{...table},tid:grid.getAttribute('data-tid'),left:grid.scrollLeft,max_left:grid.scrollWidth-grid.clientWidth,
              viewport_left:Math.max(0,g.x),viewport_right:Math.min(globalThis.innerWidth,g.x+g.width),cell_left:c.x,cell_right:c.x+c.width,
              row_visible:c.y>=Math.max(0,g.y)-1&&c.y+c.height<=Math.min(globalThis.innerHeight,g.y+g.height)+1}});
        }
        const text=own(cached,'ValueText'),nil=els[0].querySelectorAll('.bg-cell-null-value').length===1;
        if(nil) {
          if(text!==undefined)return fail('null_cache_mismatch');
          cells.push({column:field.index,is_null:true,text:null});continue;
        }
        if(typeof text!=='string'||text.length>16384||els[0].textContent!==(text===''?'\u00a0':text))return fail('cell_render_mismatch');
        cells.push({column:field.index,is_null:false,text});
      }
      values.push({index:request.row_offset+offset,record_id:recordId,cells});
    }
    return {verified:true,table:{...table},schema_id:schemaId,row_total:total,row_total_source:'bound_table_paging_controller',segment:{index:segment,size,start:rowStart,count:cachedTotal},
      column_total:names.length,columns:fields,rows:values,...(appliedFormat?{applied_format:appliedFormat}:{}),page:{...request,row_returned:values.length,column_returned:fields.length,
        next_column_offset:request.column_offset+fields.length<names.length?request.column_offset+fields.length:null,
        next_row_offset:request.row_offset+values.length<total?request.row_offset+values.length:null},
      value_source:'rendered_cell_and_cached_value_text',null_display:true,unfiltered_verified:false,execution_freshness_verified:false,numeric_precision_verified:false};
  },{table,request});
  const after=await readOutputs(page,binding,readNode);
  if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'table_context_changed'};
  return {...result,node_context:after.node_context};
}
