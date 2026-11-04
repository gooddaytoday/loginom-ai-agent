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
  const quiet=()=>wait('loading',()=>page.locator('.x-mask:visible,.x-mask-msg:visible,.bg-mask-message:visible,.x-window:visible').count().then(n=>n===0));
  const point=async l=>{await quiet();await guard();need(await l.count()===1,'control missing or ambiguous');return wait('control reachable',()=>l.evaluate(e=>{
   const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);
   return r.width>0&&r.height>0&&h&&(h===e||e.contains(h))&&!e.closest('.x-item-disabled,.x-btn-disabled')?{x,y}:null;
  }));};
  const click=async l=>{const p=await point(l);await guard();effect=true;await page.mouse.click(p.x,p.y);};
  const native=async()=>{await quiet();await guard();return page.evaluate(file=>{
   const root=document.querySelector('[data-tid='+JSON.stringify(file.slice(0,-1))+']');
   const read=(id,variable=false)=>{const es=document.querySelectorAll('[data-tid='+JSON.stringify(file+id)+']'),e=es[0],c=e&&Ext.getCmp(e.id);
    if(es.length!==1||!root?.contains(e)||c?.el?.dom!==e)throw Error('LGD field owner changed');
    if(variable){const s=document.querySelector('[data-tid='+JSON.stringify(file+id.replace(';ValueControl',';SwitchButton'))+']');if(!s||Ext.getCmp(s.id)?.pressed!==false)throw Error('LGD variables unsupported');}
    const value=c.getValue();if(!['string','boolean'].includes(typeof value))throw Error('LGD field value unavailable');
    if(c.inputEl?.dom&&typeof c.getRawValue?.()==='string'&&c.inputEl.dom.value!==c.getRawValue())throw Error('LGD uncommitted field');return value;};
   return {source_path:read('edtFileName;ValueControl',true),checksum:read('edtUseChecksum;ValueControl',true),compression:read('edtCompression'),bitness:read('edtDDFSystem'),written_checksum:read('edtWrittenChecksum'),connection:read('edtConnection')};
  },file);};
  await wait('source page',()=>find(file+'edtFileName;ValueControl').isVisible());
  if(t.source_path!==undefined){
   need(typeof t.source_path==='string'&&/^\/(?!\/)/.test(t.source_path)&&/\.lgd$/i.test(t.source_path),'verified .lgd source required');
   const l=find(file+'edtFileName;ValueControl').locator('input');
   if(await l.inputValue()!==t.source_path){await point(l);await guard();effect=true;await l.fill(t.source_path);await l.press('Tab');}
  }
  let observed=await native();
  if(t.checksum==='verify'&&observed.checksum===false){await click(find(file+'edtUseChecksum;ValueControl'));observed=await native();}
  need(observed.checksum===true&&observed.connection==='Локальное','checksum verify and local file storage required');
  need(t.source_path===undefined||observed.source_path===t.source_path,'source changed');
  need(/\.lgd$/i.test(observed.source_path),'standalone LGD required');
  // Native Next reads/validates the header and checksum; never accept an empty
  // preview as successful configuration of a corrupt source.
  const nativeError=async()=>{
   await guard();
   const error=find(root+';btnError');if(await error.count()===1&&await error.isVisible())throw Error('LGD import: '+((await error.getAttribute('data-qtip'))??'native file validation refused'));
  };
  const advance=async target=>{await nativeError();await click(find(root+';btnNext'));await wait(target,async()=>{
   await nativeError();
   return await find(root+';'+target).isVisible()&&await page.evaluate(target=>bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FCardLayout.getActiveItem().el.dom.getAttribute('data-tid').endsWith(';'+target),target);
  });};
  await advance('ColumnsMappingEngineOutputPortWizard');
  const selectedSource=observed.source_path;
  observed=await native();
  need(observed.source_path===selectedSource&&observed.checksum===true&&observed.connection==='Локальное','source or checksum changed during native validation');
  need(observed.compression==='LZ4'&&observed.written_checksum==='Сжатых данных'&&observed.bitness==='64-битная система','unsupported retained native LGD format');
  await advance('DoneWizard');
  return {verified:true,cleanup_complete:true,effect_possible:effect,configuration:{verified:true,node_context:{...t.node,verified:true},source:observed}};
 }catch(error){return {verified:false,cleanup_complete:!effect,effect_possible:effect,error:String(error.message).slice(0,1000)};}
}
