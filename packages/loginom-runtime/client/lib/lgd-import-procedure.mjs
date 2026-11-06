import {readPreparedNodeContext} from './node-context.mjs';
export const makeLgdImportConfigureCode=t=>`async page=>(${configureLgdImportBrowser.toString()})(page,${JSON.stringify(t)},${readPreparedNodeContext.toString()})`;
export async function configureLgdImportBrowser(page,t,readContext){
 const need=(v,m)=>{if(!v)throw Error('LGD import: '+m);};
 const binding={document_id:t.document_id,workflow_ref:t.workflow_ref,node:t.node};
 const root=t.workflow_ref.prefix+';WizrdMCF',file=root+';ImportNativePreviewWizard;';
 const find=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 let effect=false;
 try{
  const guard=async()=>{need(Date.now()<t.deadline,'deadline elapsed');const c=await readContext(page,binding);
   need(c.verified&&c.surface==='wizard'&&!c.input_port&&!c.output_port,'owned node wizard changed');
   need(await page.evaluate(t=>location.origin===t.origin&&bg.app.Version===t.build,t),'target changed');return c;};
  const wait=async(label,read)=>{while(Date.now()<t.deadline){await guard();const r=await read();if(r)return r;await page.waitForTimeout(Math.min(80,t.deadline-Date.now()));}throw Error('LGD import: '+label+' did not settle');};
  const nativeError=async()=>{
   await guard();
   const error=find(root+';btnError');if(await error.count()===1&&await error.isVisible())throw Error('LGD import: '+((await error.getAttribute('data-qtip'))??'native file validation refused'));
   // PreviewDataAsync reports checksum failures in the source preview status,
   // independently of the wizard's Next/Verify error button.
   const status=find(file.slice(0,-1)).locator('.bg-preview-panel-error [data-tid$=";cntErrorInfo"]:visible');
   need(await status.count()<=1,'preview error status ambiguous');
   if(await status.count()===1){const text=(await status.innerText()).trim();if(text)throw Error('LGD import: '+text);}
  };
  const quiet=()=>wait('loading',async()=>{await nativeError();return await page.locator('.x-mask:visible,.x-mask-msg:visible,.bg-mask-message:visible,.x-window:visible').count()===0;});
  const point=async l=>{await quiet();await guard();need(await l.count()===1,'control missing or ambiguous');return wait('control reachable',()=>l.evaluate(e=>{
   const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);
   return r.width>0&&r.height>0&&h&&(h===e||e.contains(h))&&!e.closest('.x-item-disabled,.x-btn-disabled')?{x,y}:null;
  }));};
  const click=async l=>{const p=await point(l);await guard();effect=true;await page.mouse.click(p.x,p.y);};
  const fileMode=async()=>{await quiet();await guard();return page.evaluate(file=>{
   const root=document.querySelector('[data-tid='+JSON.stringify(file.slice(0,-1))+']'),e=root?.querySelector('[data-tid='+JSON.stringify(file+'edtFileName;SwitchButton')+']'),c=e&&Ext.getCmp(e.id);
   if(!c||c.el.dom!==e||typeof c.pressed!=='boolean')throw Error('LGD filename mode owner changed');return c.pressed;
  },file);};
  const native=async()=>{await quiet();await guard();return page.evaluate(({file,variables})=>{
   const root=document.querySelector('[data-tid='+JSON.stringify(file.slice(0,-1))+']');
   let source_variable;
   const read=(id,variable=false)=>{const es=document.querySelectorAll('[data-tid='+JSON.stringify(file+id)+']'),e=es[0],c=e&&Ext.getCmp(e.id);
    if(es.length!==1||!root?.contains(e)||c?.el?.dom!==e)throw Error('LGD field owner changed');
    if(variable){const s=document.querySelector('[data-tid='+JSON.stringify(file+id.replace(';ValueControl',';SwitchButton'))+']');if(!s||!root.contains(s)||typeof Ext.getCmp(s.id)?.pressed!=='boolean')throw Error('LGD variable mode unavailable');
     if(Ext.getCmp(s.id).pressed){
      if(id!=='edtFileName;ValueControl')throw Error('LGD checksum variables unsupported');
      const es=document.querySelectorAll('[data-tid='+JSON.stringify(file+'edtFileName;VariableControl')+']'),e=es[0],combo=e&&Ext.getCmp(e.id);
      if(es.length!==1||!root.contains(e)||combo?.el.dom!==e)throw Error('LGD filename variable owner changed');
      if(combo.inputEl?.dom&&typeof combo.getRawValue?.()==='string'&&combo.inputEl.dom.value!==combo.getRawValue())throw Error('LGD uncommitted filename variable');
      const rows=combo.getStore().getData().items.filter(r=>r.data.field1===combo.getValue());
      const chosen=variables.filter(v=>v.type===5&&!v.is_null&&v.source?.type===5&&rows.length===1&&rows[0].data.field2===v.label+' ( '+v.value+' )');
      if(chosen.length!==1||typeof chosen[0].value!=='string'||!/^\/(?!\/)/.test(chosen[0].value)||!/\.lgd$/i.test(chosen[0].value))throw Error('LGD selected filename variable is not a verified mapped string');
      source_variable=chosen[0].name;return chosen[0].value;
     }
    }
    const value=c.getValue();if(!['string','boolean'].includes(typeof value))throw Error('LGD field value unavailable');
    if(c.inputEl?.dom&&typeof c.getRawValue?.()==='string'&&c.inputEl.dom.value!==c.getRawValue())throw Error('LGD uncommitted field');return value;};
   const source_path=read('edtFileName;ValueControl',true);
   return {source_path,...(source_variable?{source_variable}:{}),checksum:read('edtUseChecksum;ValueControl',true),compression:read('edtCompression'),bitness:read('edtDDFSystem'),written_checksum:read('edtWrittenChecksum'),connection:read('edtConnection')};
  },{file,variables:t.variables??[]});};
  await wait('source page',async()=>await find(file.slice(0,-1)).isVisible()&&await find(file+'edtFileName;SwitchButton').count()===1);
  if(t.source_binding!==undefined){
   const chosen=(t.variables??[]).filter(v=>v.name===t.source_binding&&v.type===5&&!v.is_null&&v.source?.type===5&&typeof v.value==='string');
   need(chosen.length===1&&chosen[0].value===t.source_path,'binding must select the exact verified source path');
   if(!await fileMode())await click(find(file+'edtFileName;SwitchButton'));
   await click(find(file+'edtFileName;VariableControl;trg_picker'));
   const tid=await page.evaluate(({file,chosen})=>{
    const root=document.querySelector('[data-tid='+JSON.stringify(file.slice(0,-1))+']'),es=document.querySelectorAll('[data-tid='+JSON.stringify(file+'edtFileName;VariableControl')+']'),e=es[0],c=e&&Ext.getCmp(e.id);
    if(es.length!==1||!root.contains(e)||c?.el.dom!==e)throw Error('LGD binding picker owner changed');
    const rows=c.getStore().getData().items.filter(r=>r.data.field2===chosen.label+' ( '+chosen.value+' )'),picker=c.picker,item=rows.length===1&&picker?.getNode(rows[0]);
    if(!item||picker.getRecord(item)!==rows[0]||!picker.el.dom.contains(item))throw Error('LGD binding option ambiguous');
    return item.getAttribute('data-tid');
   },{file,chosen:chosen[0]});
   need(typeof tid==='string'&&tid.startsWith(file+'edtFileName;VariableControl;boundlist;'),'LGD bound option identity required');await click(find(tid));
  }
  if(t.source_path!==undefined&&!await fileMode()){
   need(typeof t.source_path==='string'&&/^\/(?!\/)/.test(t.source_path)&&/\.lgd$/i.test(t.source_path),'verified .lgd source required');
   const l=find(file+'edtFileName;ValueControl').locator('input');
   if(await l.inputValue()!==t.source_path){await point(l);await guard();effect=true;await l.fill(t.source_path);await l.press('Tab');}
  }
  let observed=await native();
  need(!observed.source_variable||observed.source_path===t.source_path,'filename variable requires source for the exact verified file; the binding is preserved');
  need(t.source_binding===undefined||observed.source_variable===t.source_binding,'selected source binding changed');
  if(t.checksum==='verify'&&observed.checksum===false){await click(find(file+'edtUseChecksum;ValueControl'));observed=await native();}
  need(observed.checksum===true&&observed.connection==='Локальное','checksum verify and local file storage required');
  need(t.source_path===undefined||observed.source_path===t.source_path,'source changed');
  need(/\.lgd$/i.test(observed.source_path),'standalone LGD required');
  // Loginom fills these fields only after ReadHeaderAsync + PreviewDataAsync.
  // Keep the source page visible until that preview succeeds or reports its
  // own error; advancing early can hide a failed preview behind the next card.
  observed=await wait('source preview',async()=>{const v=await native();return v.compression!==''&&v.written_checksum!==''&&v.bitness!==''?v:null;});
  need(observed.compression==='LZ4'&&observed.written_checksum==='Сжатых данных'&&observed.bitness==='64-битная система','unsupported native LGD format');
  const advance=async target=>{await nativeError();await click(find(root+';btnNext'));await wait(target,async()=>{
   await nativeError();
   return await find(root+';'+target).isVisible()&&await page.evaluate(target=>bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FCardLayout.getActiveItem().el.dom.getAttribute('data-tid').endsWith(';'+target),target);
  });};
  await advance('ColumnsMappingEngineOutputPortWizard');
  const selectedSource=observed;
  observed=await native();
  need(observed.source_path===selectedSource.source_path&&observed.source_variable===selectedSource.source_variable&&observed.checksum===true&&observed.connection==='Локальное','source or checksum changed during native validation');
  need(observed.compression==='LZ4'&&observed.written_checksum==='Сжатых данных'&&observed.bitness==='64-битная система','unsupported retained native LGD format');
  await advance('DoneWizard');
  return {verified:true,cleanup_complete:true,effect_possible:effect,configuration:{verified:true,node_context:{...t.node,verified:true},source:observed}};
 }catch(error){return {verified:false,cleanup_complete:!effect,effect_possible:effect,error:String(error.message).slice(0,1000)};}
}
