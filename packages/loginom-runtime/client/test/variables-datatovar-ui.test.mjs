import test from 'node:test';
import assert from 'node:assert/strict';
import {Page} from './support/workspace-ui-fixture.mjs';

function fixture(){
 const page=new Page(),base='MF;TF-1;WizrdMCF;',box={x:30,y:100,width:500,height:300};
 page.context.innerWidth=1000;page.context.innerHeight=800;
 const wizard=page.add('div',base.slice(0,-1),'',box);
 const grid=page.add('div',base+'DataToVariablesWizard;grdUsedFields;tbl','',box,wizard);grid.attrs.id='used-grid';grid.id='used-grid';
 const row=page.add('table',null,'',{x:40,y:110,width:450,height:30},grid);
 row.attrs={class:'x-grid-item x-grid-item-selected','data-recordindex':'0','data-recordid':'x','data-boundview':grid.getAttribute('id')};
 const tr=page.add('tr',null,'',row.box,row);tr.attrs.class='x-grid-row';
 const cell=page.add('td',base+'DataToVariablesWizard;colUsedFields_X','X (Сумма)',row.box,tr);
 const summary=page.add('tr',null,'',{x:40,y:150,width:450,height:20},row);summary.attrs.class='x-grid-row-summary';
 const empty=page.add('td',cell.getAttribute('data-tid'),' ',summary.box,summary);
 const record={isModel:true,internalId:'x',data:{Name:'X',DisplayName:'X',DataType:4,GroupFunctions:1}};
 const store={$className:'Ext.data.ChainedStore',getData:()=>({items:[record]}),isLoading:()=>false};
 const view={el:{dom:grid},getStore:()=>store,getRecord:r=>r===row?record:null,getNode:r=>r===record?row:null};
 page.context.Ext={getCmp:id=>id===grid.getAttribute('id')?view:null};
 return {page,base,wizard,grid,row,cell,empty,record,view};
}

test('DataToVar UI binds only the native data row while ignoring the duplicate summary cell',async()=>{
 const f=fixture(),s=await f.page.observe();
 assert.equal(s.wizard.stage,'datatovar');
 const rows=s.ui.elements.filter(e=>e.datatovar_field);
 assert.equal(rows.length,1);assert.equal(rows[0].datatovar_field.record_id,'x');assert.equal(rows[0].datatovar_field.role,'selected');
 assert.ok(rows[0].allowed_actions.includes('double_click'));
 for(const change of [f=>f.row.attrs['data-recordid']='other',f=>f.view.getNode=()=>null,f=>f.record.data.Name='Y']){
  const f=fixture();change(f);assert.equal((await f.page.observe()).ui.elements.filter(e=>e.datatovar_field).length,0);
 }
});

test('DataToVar factor options stay bound to the selected field including portal reads',async()=>{
 const f=fixture(),tid=f.base+'FactorEditDialog';
 const dialog=f.page.add('div',tid,'',{x:100,y:100,width:500,height:500});
 const group=f.page.add('div',tid+';grpFactors','',{x:110,y:110,width:450,height:400},dialog);
 for(const [i,[icon,label]]of [['gdSum','Сумма'],['gdCount','Количество'],['gdMin','Минимум'],['gdMax','Максимум'],['gdAvg','Среднее'],['gdMedian','Медиана'],['gdMode','Мода'],['gdStdDev','Стандартное откл.'],['gdUniqueCount','Кол-во уникальных'],['gdNullCount','Кол-во пропусков'],['gdFirst','Первый'],['gdLast','Последний'],['gdOnly','Единственный'],['gdConcat','Список']].entries()){
  const t=tid+';grpFactors;chb'+(i?'-'+i:''),box={x:110,y:110+i*25,width:400,height:20};
  const owner=f.page.add('div',t,'',box,group);owner.attrs.class='x-form-type-checkbox'+(i===0?' x-form-cb-checked':'');
  const input=f.page.add('input',t+';InputEl','',box,owner);input.attrs.role='checkbox';input.style.display='none';
  f.page.add('span',t+';DisplayEl','',box,owner);
  const text=f.page.add('label',null,label,box,owner);text.attrs.class='x-form-cb-label';
  f.page.add('div',null,'',box,text).attrs.class='bg-TBGGroupDataFunction-'+icon;
 }
 const s=await f.page.observe(),e=s.wizard.factor_editor;
 assert.equal(e.status,'rendered_factor_options');assert.equal(e.selected_field.field_key,'X');
 assert.equal(e.options.length,14);assert.equal(e.options[0].checked,true);
 const narrow=await f.page.execute({mode:'observe',root_ref:e.dialog_ref});
 assert.equal(narrow.output.wizard.factor_editor.status,'rendered_factor_options');
 f.empty.ownText='unexpected';
 assert.equal((await f.page.observe()).wizard.factor_editor.status,'unobserved');
});
