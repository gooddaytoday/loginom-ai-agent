import {readPreparedNodeContext} from './node-context.mjs';
export const makeExcelConfigureCode=t=>`async page=>(${excelConfigureCapability.toString()})(page,${JSON.stringify(t)},${readPreparedNodeContext.toString()})`;

// One owned native Excel wizard. Mutations use trusted UI gestures; native
// inspection is read-only and never assigns Loginom objects or prototypes.
export async function excelConfigureCapability(page,t,readContext){
 const need=(v,m)=>{if(!v)throw Error('Excel import: '+m);};
 const remaining=()=>{const n=t.deadline-Date.now();need(n>0,'operation deadline exceeded');return n;};
 const binding={document_id:t.document_id,workflow_ref:t.workflow_ref,node:t.node};
 const root=t.workflow_ref.prefix+';WizrdMCF',file=root+';ImportExcelFilePreviewWizard;',defs=root+';ImportExcelColumnDefsWizard;',grid=defs+'ColumnDefsTuning;grdSettings;grd-1';
 const find=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 let effect=false;
 try{
  const guard=async()=>{remaining();const b=await readContext(page,binding);need(b.verified&&b.surface==='wizard'&&b.node_id===t.node.node_id,'owned wizard changed');
   need(await page.evaluate(t=>location.origin===t.origin&&bg.app.Version===t.build,t),'target changed');return b;};
  const wait=async(label,read)=>{while(remaining()>0){await guard();const v=await read();if(v)return v;await page.waitForTimeout(Math.min(80,remaining()));}throw Error(label+' did not settle');};
  const quiet=()=>wait('wizard loading',()=>page.locator('.x-mask:visible,.x-mask-msg:visible,.bg-mask-message:visible,.x-window:visible').count().then(n=>n===0));
  const point=locator=>wait('Excel control reachable: '+locator,async()=>{
   await quiet();await guard();need(await locator.count()===1,'control missing or ambiguous');
   return locator.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
    if(r.width<=0||r.height<=0||!hit||!(hit===e||e.contains(hit))||e.closest('.x-item-disabled,.x-btn-disabled'))return null;return{x,y};});
  });
  const click=async(locator,double=false)=>{await quiet();await guard();const p=await point(locator);effect=true;if(double)await page.mouse.dblclick(p.x,p.y);else await page.mouse.click(p.x,p.y);};
  const fill=async(locator,value)=>{await quiet();await guard();await point(locator);effect=true;await locator.fill(String(value));await locator.press('Tab');await wait('field readback',()=>locator.inputValue().then(v=>v===String(value)));};
  const choose=async(owner,value)=>{
   const input=find(owner).locator('input:not([type="hidden"])');
   if(await input.inputValue()===value)return;
   const picker=find(owner+';trg_picker');await click(picker);
   const portal=find(owner+';boundlist');
   await wait('owned dropdown',()=>portal.isVisible());
   const option=portal.getByRole('option',{name:value,exact:true});
   await click(option);await wait('selected dropdown value',()=>input.inputValue().then(v=>v===value));
  };
  const panel=()=>page.evaluate(()=>bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FCardLayout.getActiveItem().id);
  const advance=async()=>{const before=await panel();await click(find(root+';btnNext'));await wait('wizard page transition',async()=>{
   const error=find(root+';btnError');if(await error.count()===1&&await error.isVisible())throw Error((await error.getAttribute('data-qtip'))??'Loginom refused the Excel page');return await panel()!==before;
  });await quiet();};
  await wait('Excel source page',()=>find(file+'edtFileName;ValueControl').isVisible());
  const pathInput=find(file+'edtFileName;ValueControl').locator('input');
  if(await pathInput.inputValue()!==t.excel.source_path)await fill(pathInput,t.excel.source_path);
  await choose(file+'cbbTableNamingMethod;ValueControl',t.excel.sheet_name===undefined?'По номеру':'По имени');
  const sheet=find(file+'cbbTableName;ValueContainer;cbx').locator('input');
  await fill(sheet,t.excel.sheet_name??'1');
  const whole=find(file+'chkUsedRange;ValueControl');
  if(!await whole.evaluate(e=>e.classList.contains('x-form-cb-checked')))await click(whole);
  await choose(file+'cbbActionBlankRow;ValueControl','Импортировать');
  await fill(find(file+'edtTitleRowCount;ValueControl').locator('input'),t.excel.header_rows);
  await quiet();await guard();
  const source=await page.evaluate(({file})=>{const input=key=>{const a=document.querySelectorAll('[data-tid='+JSON.stringify(file+key)+'] input');if(a.length!==1)throw Error('Excel source field ambiguous');return a[0].value;};
   return {source_path:input('edtFileName;ValueControl'),sheet_method:input('cbbTableNamingMethod;ValueControl'),sheet:input('cbbTableName;ValueContainer;cbx'),header_rows:Number(input('edtTitleRowCount;ValueControl')),
    whole_sheet:document.querySelector('[data-tid='+JSON.stringify(file+'chkUsedRange;ValueControl')+']')?.classList.contains('x-form-cb-checked'),blank_rows:input('cbbActionBlankRow;ValueControl')};},{file});
  need(source.source_path===t.excel.source_path&&source.sheet===(t.excel.sheet_name??'1')&&source.header_rows===t.excel.header_rows&&source.whole_sheet&&source.blank_rows==='Импортировать','source settings differ');
  await advance();await wait('Excel column page',()=>find(grid).isVisible());
  await choose(defs+'cbbAutoDetectColumnsMode;ValueControl','Нет');
  const types={integer:'Целый',real:'Вещественный',string:'Строковый',datetime:'Дата/Время'};
  const read=async()=>{await quiet();await guard();return page.evaluate(({grid,root})=>{
   const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
   const elements=exact(grid),form=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
   if(elements.length!==1||exact(root).length!==1||form.FView.el.dom!==exact(root)[0]||!form.FCardLayout.getActiveItem().el.dom.contains(elements[0]))throw Error('Excel column grid owner changed');
   const cmp=Ext.getCmp(elements[0].id),store=cmp?.getStore();
   if(cmp?.el?.dom!==elements[0]||!store||store.loading||store.getCount()!==5)throw Error('Excel column grid is not ready');
   const base=grid+';normalHeaderCt;',headers=[...document.querySelectorAll('[data-tid^='+JSON.stringify(base)+']')].filter(e=>/^\d+$/.test(e.getAttribute('data-tid').slice(base.length)));
   if(headers.length<1||headers.length>8)throw Error('Excel supports 1..8 visible columns');
   return headers.map((h,i)=>{if(h.getAttribute('data-tid')!==base+i)throw Error('Excel source column order differs');
    const cells=[0,1,2,3,4].map(row=>{const es=exact(base+i+'_'+row);if(es.length!==1||!elements[0].contains(es[0]))throw Error('Excel column cell ambiguous');return es[0];});
    const checks=cells[4].querySelectorAll('.x-grid-checkcolumn');if(checks.length!==1)throw Error('Excel used flag unavailable');
    return {name:cells[0].textContent.trim(),label:cells[1].textContent.trim(),type:cells[2].textContent.trim(),data_kind:cells[3].textContent.trim(),used:checks[0].classList.contains('x-grid-checkcolumn-checked')};});
  },{grid,root});};
  let current=await read();need(current.length===t.excel.columns.length,'explicit columns must cover the whole worksheet schema');
  need(current.every((f,i)=>f.name===(t.excel.columns[i].source_name??t.excel.columns[i].name)||f.label===(t.excel.columns[i].source_name??t.excel.columns[i].name)),'source column names differ; use exact source_name headers');
  for(let i=0;i<t.excel.columns.length;i++){
   const c=t.excel.columns[i],expected={name:c.name,label:c.label,type:types[c.type],data_kind:c.data_kind??(c.type==='string'?'Дискретный':'Непрерывный'),used:true};
   for(const [row,key] of ['name','label','type','data_kind','used'].entries()){
    if(current[i][key]===expected[key])continue;
    const before=JSON.stringify(current),cell=find(grid+';normalHeaderCt;'+i+'_'+row);
    if(key==='used')await click(cell);
    else{
     await click(cell,true);
     const editors=page.locator('[data-tid^='+JSON.stringify(grid+';tbl;celleditor')+'][data-tid$=";'+(row<2?'txt':'cbx')+'"]:visible');
     await wait('column editor',()=>editors.count().then(n=>n===1));
     need(await cell.evaluate(e=>e.classList.contains('x-grid-cell-selected')),'editor is not bound to the requested cell');
     if(row<2){const input=editors.locator('input');await guard();effect=true;await input.fill(expected[key]);await input.press('Enter');}
     else{const tid=await editors.getAttribute('data-tid');await choose(tid,expected[key]);}
     await wait('column editor closed',()=>editors.count().then(n=>n===0));
    }
    current=await read();
    // A renamed native field may update its associated label. Only that same
    // requested field can change; every other column must remain identical.
    need(current.every((f,j)=>j===i||JSON.stringify(f)===JSON.parse(before).map(v=>JSON.stringify(v))[j]),'another Excel column changed');
    need(current[i][key]===expected[key],'column edit was not applied');
   }
   need(Object.keys(expected).every(k=>current[i][k]===expected[k]),'explicit column settings differ');
  }
  const auto=await find(defs+'cbbAutoDetectColumnsMode;ValueControl').locator('input').inputValue();need(auto==='Нет','automatic typing must be disabled');
  await advance();await wait('Excel output mapping',()=>find(root+';ColumnsMappingEngineOutputPortWizard;btnAddMappingColumn').isVisible());
  await advance();await wait('Excel completion page',()=>find(root+';DoneWizard').isVisible());
  const reverse=Object.fromEntries(Object.entries(types).map(([k,v])=>[v,k]));
  return {verified:true,cleanup_complete:true,effect_possible:effect,configuration:{verified:true,node_context:{...t.node,verified:true},source,auto_detect:'Нет',columns:current.map(f=>({...f,type:reverse[f.type]}))}};
 }catch(error){return {verified:false,cleanup_complete:!effect,effect_possible:effect,error:String(error.message).slice(0,1000)};}
}
