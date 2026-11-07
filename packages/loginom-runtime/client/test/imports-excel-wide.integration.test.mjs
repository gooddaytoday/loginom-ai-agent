import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {excelConfigureCapability} from '../lib/imports-excel-procedure.mjs';

for(const width of [2,12,16,64,65])test('Excel production wizard reads '+width+' DOM columns and edits the last type',
 {skip:!process.env.LOGINOM_DOCK_TEST_BROWSER},async()=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,args:['--no-proxy-server']});
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  const root='MF;TF;WizrdMCF',file=root+';ImportExcelFilePreviewWizard;',defs=root+';ImportExcelColumnDefsWizard;',grid=defs+'ColumnDefsTuning;grdSettings;grd-1';
  await page.setContent('<style>td,th{min-width:110px;height:25px}#scroll{width:320px;overflow:auto}#editor{position:fixed;left:50px;top:40px;background:white;z-index:10}</style><main></main>');
  await page.evaluate(({root,file,defs,grid,width})=>{
   const add=(tag,tid,parent=document.querySelector('main'))=>{const e=document.createElement(tag);e.setAttribute('data-tid',tid);parent.append(e);return e;};
   const wizard=add('div',root),panels=[];
   for(let i=0;i<4;i++)panels.push(add('section','panel'+i,wizard));
   let stage=0;
   const render=()=>panels.forEach((p,i)=>p.style.display=i===stage?'block':'none');
   const input=(tid,value)=>{const e=add('div',tid,panels[0]);add('input',tid+';input',e).value=value;};
   input(file+'edtFileName;ValueControl','/worker/wide.xlsx');
   input(file+'cbbTableNamingMethod;ValueControl','По номеру');
   input(file+'cbbTableName;ValueContainer;cbx','1');
   input(file+'cbbActionBlankRow;ValueControl','Импортировать');
   input(file+'edtTitleRowCount;ValueControl','1');
   add('div',file+'chkUsedRange;ValueControl',panels[0]).className='x-form-cb-checked';
   const auto=add('div',defs+'cbbAutoDetectColumnsMode;ValueControl',panels[1]);add('input',auto.dataset.tid+';input',auto).value='Нет';
   const scroller=add('div','scroll',panels[1]);scroller.id='scroll';
   const table=add('table',grid,scroller);table.id='owned-grid';
   const headers=add('tr','headers',table);
   for(let c=0;c<width;c++)add('th',grid+';normalHeaderCt;'+c,headers).textContent='Field'+c;
   for(let r=0;r<5;r++){
    const row=add('tr','row'+r,table);
    for(let c=0;c<width;c++){
     const cell=add('td',grid+';normalHeaderCt;'+c+'_'+r,row);
     if(r===4)add('span','check'+c,cell).className='x-grid-checkcolumn x-grid-checkcolumn-checked';
     else cell.textContent=r<2?'Field'+c:r===2?'Целый':width===2&&c===width-1?'Дискретный':'Непрерывный';
     if(c===width-1&&r===2)cell.ondblclick=()=>{
      window.lastTypeEditScroll=scroller.scrollLeft;
      cell.classList.add('x-grid-cell-selected');
      const editor=add('div',grid+';tbl;celleditor;cbx',wizard);editor.id='editor';
      add('input','editor-input',editor).value='Целый';
      const picker=add('button',editor.dataset.tid+';trg_picker',editor);picker.textContent='type';
      picker.onclick=()=>{
       const portal=add('div',editor.dataset.tid+';boundlist',editor);
       const label=width===2?'Логический':'Вещественный';
       const option=add('div','type-option',portal);option.setAttribute('role','option');option.textContent=label;
       option.onclick=()=>{cell.textContent=label;editor.querySelector('input').value=label;editor.style.display='none';};
      };
     };
    }
   }
   add('button',root+';ColumnsMappingEngineOutputPortWizard;btnAddMappingColumn',panels[2]);
   add('div',root+';DoneWizard',panels[3]).textContent='Done';
   add('button',root+';btnNext',wizard).onclick=()=>{stage++;render();};
   const form={FView:{el:{dom:wizard}},FCardLayout:{getActiveItem:()=>({id:'panel'+stage,el:{dom:panels[stage]}})}};
   window.bg={app:{Version:'test',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:form}})}}}}}}};
   window.Ext={getCmp:()=>({el:{dom:table},getStore:()=>({loading:false,getCount:()=>5})})};
   render();
  },{root,file,defs,grid,width});
  const type=width===2?'boolean':'real';
  const columns=Array.from({length:width},(_,i)=>({name:'Field'+i,label:'Field'+i,type:i===width-1?type:'integer'}));
  const result=await excelConfigureCapability(page,{deadline:Date.now()+30000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'excel'},
   excel:{source_path:'/worker/wide.xlsx',header_rows:1,columns},origin:'null',build:'test'},async()=>({verified:true,surface:'wizard',node_id:'excel'}));
  if(width===65){assert.equal(result.verified,false);assert.match(result.error,/1..64 columns/);return;}
  assert.equal(result.verified,true,result.error);
  assert.equal(result.configuration.columns.length,width);
  assert.equal(result.configuration.columns[width-1].type,type);
  assert.equal(result.configuration.columns[width-1].data_kind,width===2?'Дискретный':'Непрерывный');
  if(width>2)assert.ok(await page.evaluate(()=>window.lastTypeEditScroll)>0,'last column was reached by horizontal scrolling');
 }finally{await browser.close();}
});
