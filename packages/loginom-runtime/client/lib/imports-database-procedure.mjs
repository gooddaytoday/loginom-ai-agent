import {readPreparedNodeContext} from './node-context.mjs';
export const makeDatabaseImportConfigureCode=t=>`async page=>(${configureDatabaseImportBrowser.toString()})(page,${JSON.stringify(t)},${readPreparedNodeContext.toString()})`;
// Fixed native gestures on the owned DBImportWizard: activate the linked
// connection, choose table/view or SQL mode, then page to "Описание узла".
export async function configureDatabaseImportBrowser(page,t,readContext){
 const need=(v,m)=>{if(!v)throw Error('Database import: '+m);};
 const binding={document_id:t.document_id,workflow_ref:t.workflow_ref,node:t.node};
 const root=t.workflow_ref.prefix+';WizrdMCF',wiz=root+';DBImportWizard;';
 const find=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 let effect=false;
 try{
  const guard=async()=>{need(Date.now()<t.deadline,'deadline elapsed');const c=await readContext(page,binding);
   need(c.verified&&c.surface==='wizard'&&!c.input_port&&!c.output_port,'owned node wizard changed');
   need(await page.evaluate(t=>location.origin===t.origin&&bg.app.Version===t.build,t),'target changed');return c;};
  const nativeError=async()=>{
   const error=find(root+';btnError');
   if(await error.count()===1&&await error.isVisible())throw Error('Database import: '+((await error.getAttribute('data-qtip'))??'Loginom refused this wizard page'));
   const boxes=page.locator('[data-tid="msgbox;cnt"]:visible');
   if(await boxes.count()===1)throw Error('Database import: '+(await boxes.innerText()).replace(/\s+/g,' ').trim().slice(0,500));
  };
  const wait=async(label,read)=>{while(Date.now()<t.deadline){await guard();await nativeError();const r=await read();if(r)return r;await page.waitForTimeout(Math.min(80,t.deadline-Date.now()));}throw Error('Database import: '+label+' did not settle');};
  // SQL mode leaves a plain .x-mask over the hidden table-field panel
  // (lab1555-05 execution-events.jsonl:65). Wait only for loading messages and
  // windows; point() still refuses any control covered at its hit point.
  const quiet=()=>wait('loading',async()=>await page.locator('.x-mask-msg:visible,.bg-mask-message:visible,.x-window:visible').count()===0);
  const point=async l=>{await quiet();need(await l.count()===1,'control missing or ambiguous');return wait('control reachable',()=>l.evaluate(e=>{
   const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);
   return r.width>0&&r.height>0&&h&&(h===e||e.contains(h))&&!e.closest('.x-item-disabled,.x-btn-disabled')?{x,y}:null;
  }));};
  const click=async(l,double=false)=>{const p=await point(l);await guard();effect=true;await page.mouse[double?'dblclick':'click'](p.x,p.y);};
  const state=async()=>{await guard();return page.evaluate(wiz=>{
   const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
   const ws=(c.FWizardItems??[]).map(x=>x.FWizard).filter(x=>x?.constructor?.name==='DBImportWizard');
   if(ws.length!==1)throw Error('Database import: owned DBImportWizard is unavailable');
   const w=ws[0],one=tid=>{const es=document.querySelectorAll('[data-tid='+JSON.stringify(wiz+tid)+']');if(es.length!==1)throw Error('Database import: control '+tid+' is missing');return es[0];};
   const input=tid=>one(tid).querySelector('input')?.value??null;
   const records=w.Items?.grdTableFields?.getStore?.()?.getRange?.()??[];
   return {connection:input('edtConnection'),connected:w.Connected===true,sql_mode:w.IsNowSQLImportMode===true,
    table:input('pedTableName;ValueControl'),sql:w.IsNowSQLImportMode&&w.FImportObjSql?w.FImportObjSql.GetQuery():null,
    fields:records.map(r=>({name:r.data.Name??r.data.FieldName??null,checked:r.data.Checked===true})),
    page:c.FCardLayout.getActiveItem().el.dom.getAttribute('data-tid')};
  },wiz);};
  await wait('database import page',async()=>await find(wiz+'btnConnect').count()===1&&await find(wiz+'edtConnection').isVisible());
  let s=await state();
  need(t.database_path===null?!!s.connection:s.connection===t.database_path,'linked connection differs: wizard shows '+JSON.stringify(s.connection)+', requested '+JSON.stringify(t.database_path));
  if(t.mode){
   if(!s.connected){await click(find(wiz+'btnConnect'));s=await wait('connection activation',async()=>{const v=await state();return v.connected?v:null;});}
   if(s.sql_mode!==(t.mode==='sql')){await click(find(wiz+(t.mode==='sql'?'rbSQL':'rbTable')+';DisplayEl'));s=await wait('import mode',async()=>{const v=await state();return v.sql_mode===(t.mode==='sql')?v:null;});}
   if(t.mode==='table'&&s.table!==t.table){
    const item=async()=>page.locator('[data-tid^='+JSON.stringify(wiz+'pnlDBObjects;headercontainer;text_0>')+'][data-tid$=";TreeText"]').evaluateAll((es,name)=>es
     .filter(e=>/;headercontainer;text_0>(Таблицы|Представления)>[^>]+;TreeText$/.test(e.getAttribute('data-tid'))&&e.textContent.trim()===name).map(e=>e.getAttribute('data-tid')),t.table);
    let found=await item();
    if(!found.length)for(const group of ['Таблицы','Представления']){
     const expander=find(wiz+'pnlDBObjects;headercontainer;text_0>'+group+';TreeExpander');
     if(await expander.count()===1&&!(await item()).length){await click(expander);await page.waitForTimeout(200);}
    }
    found=await wait('table or view '+t.table,async()=>{const f=await item();need(f.length<=1,'table or view name is ambiguous');return f.length?f:null;});
    await click(find(found[0]),true);
    s=await wait('selected table',async()=>{const v=await state();return v.table===t.table&&v.fields.length>0?v:null;});
    if(!s.fields.every(f=>f.checked)){await click(find(wiz+'btnExtractAll'));s=await wait('all fields selected',async()=>{const v=await state();return v.fields.every(f=>f.checked)?v:null;});}
   }
   if(t.mode==='sql'&&(s.sql??'').replace(/\r\n/g,'\n')!==t.sql){
    const editor=find(wiz+'cmpQueryCM').locator('.CodeMirror');need(await editor.count()===1,'SQL editor is unavailable');
    await click(editor);await page.keyboard.press('Control+A');await page.keyboard.insertText(t.sql);
    s=await wait('SQL text',async()=>{const v=await state();return (v.sql??'').replace(/\r\n/g,'\n')===t.sql?v:null;});
   }
   need(s.connected&&s.sql_mode===(t.mode==='sql')&&(t.mode==='sql'?s.sql.replace(/\r\n/g,'\n')===t.sql:s.table===t.table),'requested source readback differs');
  }
  const selected={mode:s.sql_mode?'sql':'table',...(s.sql_mode?{sql:(s.sql??'').replace(/\r\n/g,'\n')}:{table:s.table}),database_path:s.connection};
  need(selected.mode==='sql'?selected.sql.length>0:!!selected.table,'saved import source is empty; supply database with mode table or sql');
  const pages=[];
  for(let i=0;i<5;i++){
   const active=(await state()).page;pages.push(active.split(';').at(-1));
   if(active.endsWith(';DoneWizard'))return {verified:true,cleanup_complete:true,effect_possible:effect,configuration:{verified:true,node_context:{...t.node,verified:true},...selected,pages}};
   await nativeError();await click(find(root+';btnNext'));
   await wait('wizard page after '+pages.at(-1),async()=>(await state()).page!==active);
  }
  throw Error('Database import: description page was not reached');
 }catch(error){return {verified:false,cleanup_complete:!effect,effect_possible:effect,error:String(error.message).slice(0,1000)};}
}
