import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readNodeTable,makeNodeTableContextCode} from '../lib/node-table-context.mjs';

function fixture() {
 const table={port_guid:'11111111-1111-1111-1111-111111111111',view_guid:'22222222-2222-2222-2222-222222222222',table_tid:'MF;TF-1;ViewsForm;BrowseView'};
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'views'},elements=new Map();
 const el=(tid,attrs={},box={x:0,y:0,width:800,height:500})=>{
  const e={attrs:{'data-tid':tid,...attrs},children:[],textContent:'',box,
   getAttribute(k){return this.attrs[k]??null},getBoundingClientRect(){return this.box},
   contains(x){return this.children.includes(x)||this.children.some(c=>c.contains(x))},
   all(){return this.children.flatMap(c=>[c,...c.all()])},
   querySelectorAll(q){return this.all().filter(e=>q==='[data-tid]'?typeof e.attrs['data-tid']==='string':q==='table.x-grid-item'?e.tag==='table':q==='.bg-cell-null-value'?e.attrs.class==='bg-cell-null-value':false)}};
  e.classList={contains:k=>(e.attrs.class??'').split(' ').includes(k)};elements.set(tid,e);return e;
 };
 const root=el(table.table_tid),left=el(table.table_tid+';grdData;grd;tbl'),right=el(table.table_tid+';grdData;grd-1;tbl');left.id='left';right.id='right';root.children=[left,right];
 const nulls=el(table.table_tid+';btnDataGridShowNulls',{class:'x-btn-pressed'});root.children.push(nulls);
 const header=el(table.table_tid+';normalHeaderCt');root.children.push(header);
 const names=['Id','Text','Amount'],types=['dtInteger','dtString','dtFloat'];
 const columns=names.map((name,i)=>{const e=el(table.table_tid+';normalHeaderCt;'+name,{class:'bg-TBGDataType-'+types[i]+'-before'});e.textContent=name;header.children.push(e);return {dataIndex:name,el:{dom:e}}});
 const records=[],cells=[],rows=[];
 for(let rowIndex=0;rowIndex<3;rowIndex++) {
  const l=el('left-'+rowIndex,{'data-recordid':'r'+rowIndex,'data-boundview':'left','data-recordindex':String(rowIndex)}),r=el('right-'+rowIndex,{'data-recordid':'r'+rowIndex,'data-boundview':'right','data-recordindex':String(rowIndex)});l.tag=r.tag='table';left.children.push(l);right.children.push(r);rows.push([l,r]);
  const data={$RowIndex:rowIndex,$RecIndex:rowIndex};
  const vals=[[String(rowIndex+1),'1,2345678901234567E+00'],[String(rowIndex+1),'-2,5E+00'],[String(rowIndex+1),'0E+00']][rowIndex];
  for(let c=0;c<3;c++) {
   const e=el(columns[c].el.dom.getAttribute('data-tid')+'_'+rowIndex,{}, {x:c*120,y:rowIndex*30,width:120,height:30});r.children.push(e);cells.push(e);
   const text=c===0?vals[0]:c===2?vals[1]:rowIndex===0?'one;two':rowIndex===1?'':null;
   if(text===null){data[names[c]]={Style:2,HorizontalAlignment:2};e.textContent='<null>';e.children.push(el('null-'+rowIndex,{class:'bg-cell-null-value'}));}
   else {data[names[c]]={ValueText:text};e.textContent=text===''?'\u00a0':text;}
  }
  records.push({isModel:true,internalId:'r'+rowIndex,data});
 }
 const store={$className:'Ext.data.BufferedStore',isLoading:()=>false,totalCount:3,data:{_pageSize:25,map:{'1':{value:records}}}};
 const views={left:{el:{dom:left},getStore:()=>store},right:{el:{dom:right},getStore:()=>store,headerCt:{el:{dom:header},getGridColumns:()=>columns}}};
 class BrowseViewPagingProxy{};
 const paging=Object.assign(new BrowseViewPagingProxy(),{FViewDataInvalid:false,FRequiredPrepareViewData:false,FTotalRowCount:3,FPageIndex:0,FPageSize:1000000});
 const base={FView:{el:{dom:root}},FStatus:4,FBrowseViewDataProxyController:paging,FBrowseViewDataSourceController:{FDataStore:store},FBrowseViewColumnsController:{FColumnNames:names}};
 const model={FViewDescList:{[table.view_guid]:{BaseView:base}}};
 const context=vm.createContext({Object,document:{querySelectorAll:q=>q==='.x-mask-msg,.bg-mask-message'?[]:[...elements.values()].filter(e=>e.attrs['data-tid']===JSON.parse(q.slice(10,-1)))},
   Ext:{getCmp:id=>views[id]},bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:model}})}}}}}}},
   getComputedStyle:()=>({display:'block',visibility:'visible'}),innerWidth:1000,innerHeight:800});
 const page={evaluate:(fn,arg)=>structuredClone(vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context))};
 const outputs={verified:true,tables:[{...table,active:true}],node_context:node},readOutputs=async()=>structuredClone(outputs);
 const request={row_offset:0,row_limit:10,column_offset:0,column_limit:8};
 return {el,page,table,node,readOutputs,outputs,request,root,left,right,base,paging,store,views,records,cells,rows,columns,names,nulls,header};
}
const read=f=>readNodeTable(f.page,{},f.table,f.request,f.readOutputs);
test('Table reads complete small output from matching native cache strings and rendered cells',async()=>{
 const f=fixture(),r=await read(f);assert.equal(r.verified,true,JSON.stringify(r));assert.equal(r.row_total,3);
 assert.equal(r.rows[1].cells[1].text,'');assert.equal(r.rows[2].cells[1].is_null,true);
 assert.equal(r.rows[0].cells[2].text,'1,2345678901234567E+00');assert.equal(r.numeric_precision_verified,false);
 assert.equal(r.execution_freshness_verified,false);assert.equal(r.unfiltered_verified,false);
});
test('literal NBSP remains distinct from the empty native display placeholder',async()=>{
 const f=fixture();f.records[1].data.Text.ValueText='\u00a0';
 const r=await read(f);assert.equal(r.verified,true);assert.equal(r.rows[1].cells[1].text,'\u00a0');
});
test('zero rows remains a complete empty page with an observed schema',async()=>{
 const f=fixture();f.store.totalCount=0;f.paging.FTotalRowCount=0;f.store.data.map={};f.left.children=[];f.right.children=[];
 const r=await read(f);assert.equal(r.verified,true);assert.equal(r.row_total,0);assert.deepEqual(r.rows,[]);assert.equal(r.columns.length,3);
});
test('schema and row cursors describe a bounded page, not a full output claim',async()=>{
 const f=fixture();f.request.column_offset=1;f.request.column_limit=1;f.request.row_limit=1;
 const r=await read(f);assert.equal(r.verified,true);assert.equal(r.page.next_column_offset,2);assert.equal(r.page.next_row_offset,1);
});
for(const [name,change] of Object.entries({
 foreign_table:f=>f.outputs.tables[0].view_guid='other',wrong_port:f=>f.outputs.tables[0].port_guid='other',inactive:f=>f.outputs.tables[0].active=false,
 wrong_native_view:f=>f.views.right.el.dom={},foreign_store:f=>f.views.right.getStore=()=>({}),loading:f=>f.store.isLoading=()=>true,
 invalidated:f=>f.paging.FViewDataInvalid=true,total_mismatch:f=>f.paging.FTotalRowCount=4,
 duplicate_schema:f=>f.names[1]='Id',foreign_column:f=>f.columns[1].dataIndex='foreign',
 hidden_nulls:f=>f.nulls.attrs.class='',uncached_row:f=>f.store.data.map={},
 replaced_row:f=>f.rows[1][1].attrs['data-recordid']='other',wrong_index:f=>f.records[1].data.$RowIndex=0,
 offscreen_cell:f=>f.cells[0].box.x=2000,cache_dom_disagree:f=>f.records[1].data.Text.ValueText='different',
 wrong_null:f=>f.records[2].data.Text.ValueText='',
}))test('Table refuses '+name,async()=>{const f=fixture();change(f);assert.equal((await read(f)).verified,false);});
test('cached cell accessors and dataset proxies are never invoked',async()=>{
 const f=fixture();let calls=0;
 Object.defineProperty(f.base,'FModelViewNode',{get(){calls++;throw Error('RPC access')}});
 assert.equal((await read(f)).verified,true);assert.equal(calls,0);
 Object.defineProperty(f.records[0].data.Id,'ValueText',{get(){calls++;return '1'}});
 assert.equal((await read(f)).verified,false);assert.equal(calls,0);
});
test('changing the prepared port context invalidates a finished read',async()=>{
 const f=fixture();let calls=0;f.readOutputs=async()=>({...f.outputs,node_context:{...f.node,node_id:++calls===1?'node':'other'}});
 assert.equal((await read(f)).reason,'table_context_changed');
});
test('serialized Table read requires a bounded page and exact prepared identity',()=>{
 assert.throws(()=>makeNodeTableContextCode({},fixture().table,fixture().request));
});

test('Table schema identity covers columns outside the requested page and changes with native cache',async()=>{
 const f=fixture();f.request.column_limit=1;const first=await read(f),again=await read(f);
 assert.equal(first.schema_id,again.schema_id);
 f.columns[2].el.dom.textContent='Other label';const label=await read(f);assert.equal(label.verified,true);assert.notEqual(label.schema_id,first.schema_id);
 f.columns[2].el.dom.attrs.class='bg-TBGDataType-dtInteger-before';const type=await read(f);assert.notEqual(type.schema_id,label.schema_id);
});
test('Table offscreen cell geometry is tied to a verified row and schema',async()=>{
 const f=fixture();f.cells[0].box.x=1200;Object.assign(f.right,{scrollLeft:0,scrollWidth:2000,clientWidth:800});
 const r=await read(f);assert.equal(r.reason,'cell_not_visible');assert.equal(r.horizontal_window.cell_left,1200);
 assert.equal(r.horizontal_window.row_visible,true);assert.ok(r.schema_id);assert.deepEqual(r.horizontal_window.table,f.table);
});

function singleAppliedFormatFixture() {
 const f=fixture();f.names.splice(1);f.columns.splice(1);
 const tid=f.table.table_tid+';ModalWindow_BrowseFormat',modal=f.el(tid,{class:'x-hidden-offsets'}),form=f.el(tid+';BrowseFormat'),grid=f.el(tid+';BrowseFormat;grdFields;tbl');
 grid.id='format-grid';modal.children=[form];form.children=[grid];
 const record={isModel:true,data:{Index:0,SourceColumnIndex:0,Name:'Id',DataType:4,InGrid:true,DisplayFormat:'0'}};
 const store={$className:'Ext.data.Store',isLoading:()=>false,getCount:()=>1,getData:()=>({items:[record]})};
 f.views['format-grid']={el:{dom:grid},getStore:()=>store};
 Object.assign(f.base.FBrowseViewColumnsController,{FBrowseFormatModal:{FResult:'ok',FView:{el:{dom:modal}}},FBrowseFormat:{FInitialized:true,FView:{el:{dom:form}}}});
 return {...f,formatRecord:record,formatStore:store,formatModal:modal};
}
test('sole column reads its committed closed format UI model without reopening or RPC',async()=>{
 const f=singleAppliedFormatFixture();let calls=0;
 Object.defineProperty(f.base.FBrowseViewColumnsController,'FViewColumns',{get(){calls++;throw Error('RPC')}});
 const r=await read(f);assert.equal(r.applied_format.verified,true);assert.equal(r.applied_format.fields[0].mask,'0');assert.equal(calls,0);
});
for(const [name,change] of Object.entries({cancel:f=>f.base.FBrowseViewColumnsController.FBrowseFormatModal.FResult='cancel',
 open:f=>f.formatModal.attrs.class='',wrong_field:f=>f.formatRecord.data.Name='other',wrong_type:f=>f.formatRecord.data.DataType=2,
 wrong_index:f=>f.formatRecord.data.SourceColumnIndex=1,loading:f=>f.formatStore.isLoading=()=>true,
 foreign_grid:f=>f.views['format-grid'].el.dom={},wrong_form:f=>f.base.FBrowseViewColumnsController.FBrowseFormat.FView.el.dom=f.root}))
 test('applied format proof refuses '+name,async()=>{const f=singleAppliedFormatFixture();change(f);assert.equal((await read(f)).applied_format,undefined);});

test('recycled cell suffixes use the bound record row and exact field header',async()=>{
 const f=fixture();
 for(const c of f.cells)c.attrs['data-tid']=c.attrs['data-tid'].replace(/_(\d+)$/,(_,n)=>'_'+(Number(n)+31));
 assert.equal((await read(f)).verified,true);
 f.records[1].data.Text.ValueText='different';
 assert.equal((await read(f)).reason,'cell_render_mismatch');
});
test('recycled cells still reject duplicate identities and cells in a different record row',async()=>{
 for(const fault of ['duplicate','other_row']){
  const f=fixture(),cell=f.cells[0];
  if(fault==='duplicate'){const copy=f.el('other');copy.attrs['data-tid']=cell.attrs['data-tid'];f.rows[0][1].children.push(copy);}
  else {f.rows[0][1].children=f.rows[0][1].children.filter(e=>e!==cell);f.rows[1][1].children.push(cell);}
  assert.equal((await read(f)).verified,false,fault);
 }
});

test('identical recycled test IDs in different native record rows remain independently readable',async()=>{
 const f=fixture();
 for(let column=0;column<3;column++)f.cells[3+column].attrs['data-tid']=f.cells[column].attrs['data-tid'];
 const r=await read(f);assert.equal(r.verified,true,JSON.stringify(r));
 assert.equal(r.rows[0].cells[0].text,'1');assert.equal(r.rows[1].cells[0].text,'2');
 f.rows[1][1].attrs['data-recordid']='r0';
 assert.equal((await read(f)).verified,false);
});
