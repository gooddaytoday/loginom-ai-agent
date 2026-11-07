import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {excelConfigureCapability} from '../lib/imports-excel-procedure.mjs';

test('C3 production capability selects the exact range, toggles extension and inspects without resetting it',
 {skip:!process.env.LOGINOM_DOCK_TEST_BROWSER},async()=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,args:['--no-proxy-server']});
 try{
  const page=await browser.newPage();
  const root='MF;TF;WizrdMCF',file=root+';ImportExcelFilePreviewWizard;',defs=root+';ImportExcelColumnDefsWizard;',grid=defs+'ColumnDefsTuning;grdSettings;grd-1';
  await page.setContent('<main></main>');
  await page.evaluate(({root,file,defs,grid})=>{
   const add=(tag,tid,parent=document.querySelector('main'))=>{const e=document.createElement(tag);e.dataset.tid=tid;parent.append(e);return e;};
   const wizard=add('div',root),panels=Array.from({length:4},(_,i)=>add('section',i===0?file.slice(0,-1):'panel'+i,wizard));
   let stage=0;
   const render=()=>panels.forEach((p,i)=>p.style.display=i===stage?'block':'none');
   const input=(tid,value)=>{const e=add('div',tid,panels[0]);add('input',tid+';input',e).value=value;return e;};
   const combo=(tid,value,options)=>{
    const e=input(tid,value),picker=add('button',tid+';trg_picker',e);picker.textContent='Choose';
    picker.onclick=()=>{const portal=add('div',tid+';boundlist',e);
     for(const value of options){const option=add('div',tid+';boundlist;'+value,portal);option.setAttribute('role','option');option.textContent=value+(value.startsWith('SalesRange')?' Data':'');
      option.onclick=()=>{e.querySelector('input').value=value;portal.remove();};}
    };
   };
   input(file+'edtFileName;ValueControl','/worker/named.xlsx');
   combo(file+'cbbTableNamingMethod;ValueControl','По номеру',['По номеру','По имени','Именованный диапазон']);
   combo(file+'cbbTableName;ValueContainer;cbx','1',['SalesRangeOther','SalesRange']);
   input(file+'cbbActionBlankRow;ValueControl','Импортировать');input(file+'edtTitleRowCount;ValueControl','1');
   const all=add('button',file+'chkAllRows;ValueControl',panels[0]);all.textContent='Extend';
   all.onclick=()=>all.classList.toggle('x-form-cb-checked');
   add('div',file+'chkUsedRange;ValueControl',panels[0]);
   const auto=add('div',defs+'cbbAutoDetectColumnsMode;ValueControl',panels[1]);add('input','auto',auto).value='Нет';
   const table=add('table',grid,panels[1]);table.id='grid';
   const headers=add('tr','headers',table);
   for(let i=0;i<2;i++)add('th',grid+';normalHeaderCt;'+i,headers);
   for(let row=0;row<5;row++){
    const tr=add('tr','row'+row,table);
    for(let i=0;i<2;i++){
     const cell=add('td',grid+';normalHeaderCt;'+i+'_'+row,tr);
     if(row===4)add('span','used'+i,cell).className='x-grid-checkcolumn x-grid-checkcolumn-checked';
     else cell.textContent=row<2?['Id','Amount'][i]:row===2?'Целый':'Непрерывный';
    }
   }
   add('button',root+';ColumnsMappingEngineOutputPortWizard;btnAddMappingColumn',panels[2]);add('div',root+';DoneWizard',panels[3]).textContent='Done';
   add('button',root+';btnNext',wizard).onclick=()=>{stage++;render();};
   const form={FView:{el:{dom:wizard}},FCardLayout:{getActiveItem:()=>({id:'panel'+stage,el:{dom:panels[stage]}})}};
   window.bg={app:{Version:'test',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:form}})}}}}}}};
   window.Ext={getCmp:()=>({el:{dom:table},getStore:()=>({loading:false,getCount:()=>5})})};
   window.reopen=()=>{stage=0;render();};render();
  },{root,file,defs,grid});
  for(const [extend_range,inspect] of [[false,false],[true,false],[true,true],[false,false]]){
   await page.evaluate(()=>window.reopen());
   const result=await excelConfigureCapability(page,{deadline:Date.now()+5000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'excel'},inspect,
    excel:{source_path:'/worker/named.xlsx',named_range:'SalesRange',extend_range,header_rows:1,columns:['Id','Amount'].map(name=>({name,label:name,type:'integer'}))},origin:'null',build:'test'},async()=>({verified:true,surface:'wizard',node_id:'excel'}));
   assert.equal(result.verified,true,result.error);
   assert.equal(result.configuration.source.named_range,'SalesRange');assert.equal(result.configuration.source.extend_range,extend_range);
   assert.equal(result.configuration.source.whole_sheet,false);
   assert.deepEqual(result.configuration.columns.map(c=>c.name),['Id','Amount']);
   if(inspect)assert.equal(result.configuration.source.sheet_method,'Именованный диапазон');
  }
  const missing=file+'cbbTableName;ValueContainer;cbx;trg_picker';
  await page.evaluate(({file,missing})=>{
   window.reopen();
   document.querySelector('[data-tid='+JSON.stringify(file+'cbbTableNamingMethod;ValueControl')+'] input').value='По номеру';
   document.querySelector('[data-tid='+JSON.stringify(file+'cbbTableName;ValueContainer;cbx')+'] input').value='1';
   document.querySelector('[data-tid='+JSON.stringify(missing)+']').remove();
  },{file,missing});
  const failed=await excelConfigureCapability(page,{deadline:Date.now()+2000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'excel'},
   excel:{source_path:'/worker/named.xlsx',named_range:'SalesRange',extend_range:false,header_rows:1,columns:[]},origin:'null',build:'test'},async()=>({verified:true,surface:'wizard',node_id:'excel'}));
  assert.equal(failed.verified,false);assert.ok(failed.error.includes(missing),failed.error);
  assert.equal(failed.diagnostic.status,'observed');
  assert.ok(failed.diagnostic.visible_panels.includes(file.slice(0,-1)));
  assert.ok(failed.diagnostic.controls.some(c=>c.tid===file+'cbbTableName;ValueContainer;cbx'));
  assert.equal(failed.diagnostic.controls.some(c=>c.tid===missing),false);
 }finally{await browser.close();}
});
