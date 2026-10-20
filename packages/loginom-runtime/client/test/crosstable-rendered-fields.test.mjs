import test from 'node:test';
import assert from 'node:assert/strict';
import {Page} from './support/workspace-ui-fixture.mjs';

function fixture(label='Track Замена',used=false){
 const page=new Page(),base='MF;TF-1;WizrdMCF;CrossTabWizard;';
 page.context.innerWidth=1000;page.context.innerHeight=800;
 const wizard=page.add('div','MF;TF-1;WizrdMCF','',{x:20,y:80,width:900,height:600});
 const components=new Map();
 const grid=page.add('div',base+(used?'grdUsedFields':'grdDataFields')+';tbl','',{x:40,y:120,width:400,height:250},wizard);
 grid.id='cross-grid';grid.attrs.id=grid.id;
 if(!used)page.add('div',base+'grdUsedFields;tbl','',{x:500,y:120,width:400,height:250},wizard);
 const row=page.add('table',null,'',{x:40,y:160,width:400,height:24},grid);
 row.attrs={class:'x-grid-item','data-recordid':'1616','data-boundview':grid.id};
 const record={isModel:true,internalId:'1616',data:{DisplayName:label,Index:3,IsCountCase:false,Disposition:used?1:0}};
 const cell=page.add('td',base+(used?'colUsedFields_':'colDisplayName_')+label.replace(/\s/g,'_').replace(/,/g,''),label,row.box,row);
 const store={$className:'Ext.data.ChainedStore',getData:()=>({items:[record]}),isLoading:()=>false};
 const view={el:{dom:grid},getStore:()=>store,getRecord:r=>r===row?record:null,getNode:r=>r===record?row:null};
 components.set(grid.id,view);page.context.Ext={getCmp:id=>components.get(id)};
 return {page,base,wizard,grid,row,record,cell,view,store};
}

test('CrossTable binds formatted labels to exact available and used native records',async()=>{
 for(const used of [false,true])for(const label of ['Track Замена','Track Заменен','Сумма, руб.','Track_Замена']){
  const f=fixture(label,used),s=await f.page.observe();
  assert.equal(s.wizard.stage,'crosstable');
  const cell=s.ui.elements.find(e=>e.crosstable_field?.record_id==='1616');
  assert.ok(cell,label);assert.equal(cell.crosstable_field.label,label);
  assert.equal(cell.crosstable_field.input_index,3);assert.equal(cell.crosstable_field.role,used?'used':'available');
  assert.deepEqual(cell.allowed_actions,['click','double_click','press'],JSON.stringify({used,label,cell}));
  assert.equal((await f.page.act({verb:'click',ref:cell.ref},s)).status,'SUCCEEDED');
  assert.equal(f.page.events.filter(e=>e==='click').length,1);
 }
});

test('CrossTable formatted labels retain native row, store, visibility and uniqueness guards',async()=>{
 const faults={
  foreign_view:f=>f.view.el.dom={},foreign_store:f=>f.store.$className='Ext.data.Store',
  loading:f=>f.store.isLoading=()=>true,foreign_record:f=>f.view.getRecord=()=>({...f.record}),
  replaced_row:f=>f.view.getNode=()=>({}),wrong_record_id:f=>f.row.attrs['data-recordid']='other',
  wrong_bound_view:f=>f.row.attrs['data-boundview']='other',service:f=>f.record.data.IsCountCase=true,
  wrong_disposition:f=>f.record.data.Disposition=2,wrong_tid:f=>f.cell.attrs['data-tid']=f.base+'colDisplayName_Other',
  raw_label_tid:f=>f.cell.attrs['data-tid']=f.base+'colDisplayName_Track Замена',
  hidden:f=>f.cell.style.display='none',summary:f=>f.row.attrs.class+=' x-grid-row-summary',
  duplicate:f=>f.page.add('td',f.cell.attrs['data-tid'],'Track Замена',f.cell.box,f.row),
 };
 for(const [name,mutate] of Object.entries(faults)){
  const f=fixture();mutate(f);const s=await f.page.observe();
  assert.equal(s.ui.elements.some(e=>e.crosstable_field),false,name);
  assert.equal(f.page.events.length,0,name);
 }
});
