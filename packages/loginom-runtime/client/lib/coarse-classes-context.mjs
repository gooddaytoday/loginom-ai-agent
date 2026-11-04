import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeCoarseClassesContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readCoarseClassesContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readCoarseClassesBrowser.toString()})`;}
export async function readCoarseClassesContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readCoarseClassesBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'coarse_classes_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'coarse_classes_owner_changed'};
 return {...result,node_context:after};
}
// LAB-775: only rendered data-tid owners and complete local UI stores. No
// Column/Engine getters or server methods are read, invoked or replaced.
export function readCoarseClassesBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;CoarseClassesWizard-1';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const modelBase=prefix+';WizrdMCF;CoarseClassesWizard-2',modelRoots=exact(modelBase);
 if(modelRoots.length===1&&modelRoots[0].checkVisibility({checkVisibilityCSS:true})){
  const grids=[...modelRoots[0].querySelectorAll('[data-tid$=";grdBinning"]')];
  const grid=grids.length===1?globalThis.Ext?.getCmp?.(grids[0].id):null,store=grid?.getStore?.(),data=store?.getData?.(),rs=data?.items,source=data?.getSource?.()?.items;
  if(grid?.el?.dom!==grids[0]||store?.$className!=='Ext.data.Store'||store.isLoading?.()||store.isBufferedStore||!Array.isArray(rs)||rs.length>1000||store.getCount?.()!==rs.length||source&&(source.length!==rs.length||source.some(r=>!rs.includes(r))))return fail('coarse_classes_model_inventory');
  const classes=[];
  for(const r of rs){
   if(!r?.isModel||!r.data)return fail('coarse_classes_model_record');
   const read=names=>{const keys=Object.keys(r.data).filter(k=>names.includes(k.toLowerCase().replace(/_/g,'')));return keys.length===1?r.data[keys[0]]:undefined;};
   const number=read(['classnumber','classnum','number']),category=read(['uniquevalue','value']),mark=read(['classmark','mark']),woe=read(['woe']),iv=read(['iv']);
   if(!Number.isInteger(number)||number<0||typeof category!=='string'||typeof mark!=='string'||!Number.isFinite(woe)||!Number.isFinite(iv))return fail('coarse_classes_model_columns:'+Object.keys(r.data).join(','));
   classes.push({number,category,mark,woe,iv});
  }
  return {verified:true,state:classes.length?'materialized':'settings',classes};
 }
 const roots=exact(base),root=roots[0];
 if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true}))return fail('coarse_classes_root');
 const cmp=t=>{const es=exact(t),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]&&root.contains(es[0])?c:null;};
 const wizard=exact(prefix+';WizrdMCF'),w=wizard.length===1?globalThis.Ext?.getCmp?.(wizard[0].id):null;
 const view=globalThis.Ext?.getCmp?.(root.id),controller=view?.['@@TestCmpController'];
 if(view?.el?.dom!==root||!controller||controller.FWizardForm?.FView!==w)return fail('coarse_classes_page_owner');
 const queues=Object.getOwnPropertySymbols(w).filter(s=>s.description==='LockQueue');
 if(queues.length!==1||w[queues[0]]?.IsEmpty!==true)return fail('coarse_classes_pending');
 const candidates=[];
 for(const e of root.querySelectorAll('[data-tid]')){
  const g=globalThis.Ext?.getCmp?.(e.id);
  if(g?.el?.dom!==e||typeof g.getStore!=='function'||typeof g.getSelectionModel!=='function')continue;
  const store=g.getStore(),data=store?.getData?.(),rs=data?.items,source=data?.getSource?.()?.items;
  if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||!Array.isArray(rs)||!rs.length||rs.length>1000||store.getCount?.()!==rs.length||source&&(source.length!==rs.length||source.some(r=>!rs.includes(r))))continue;
  if(rs.every(r=>r?.isModel&&typeof r.data?.Name==='string'&&Number.isInteger(r.data?.ColumnPurpose)))candidates.push({g,rs});
 }
 if(candidates.length!==1)return fail('coarse_classes_field_inventory');
 const {g,rs}=candidates[0],selection=g.getSelectionModel().getSelection();
 if(!Array.isArray(selection)||selection.length>1||selection.some(r=>!rs.includes(r)))return fail('coarse_classes_selection');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},kinds={0:'Неопределенное',1:'Непрерывный',2:'Дискретный'},fields=[];
 for(const [index,r] of rs.entries()){
  const d=r.data;
  if(d.Index!==index||!d.Name||typeof d.DisplayName!=='string'||!types[d.DataType]||!kinds[d.DataKind]||![0,1,4].includes(d.ColumnPurpose))return fail('coarse_classes_field');
  fields.push({index,record_id:String(r.internalId),name:d.Name,label:d.DisplayName,type:types[d.DataType],data_kind:kinds[d.DataKind],role:{0:'unused',1:'input',4:'target'}[d.ColumnPurpose]});
 }
 if(new Set(fields.map(f=>f.name)).size!==fields.length||new Set(fields.map(f=>f.record_id)).size!==fields.length)return fail('coarse_classes_identity');
 const selected=selection.length?fields[rs.indexOf(selection[0])]:null,settings={},controlBase=base+';CoarseClassesSettingsFrame;';
 for(const [key,path] of Object.entries({role:'cbxColumnPurpose',min_class_percent:'edtMinimalClassRate;ValueControl',max_classes:'edtDesiredClassCount;ValueControl',uniformity_percent:'edtUniformityCoefficient;ValueControl',fine_classes:'chkUseFineClassesBinning;ValueControl'})){
  const c=cmp(controlBase+path);settings[key]=typeof c?.getValue==='function'?c.getValue():null;
 }
 const event=cmp(controlBase+'cbxEventValue;ValueContainer;txt-1');
 settings.event_value=typeof event?.getValue==='function'?event.getValue():null;
 if(selected&&settings.role!=={unused:0,input:1,target:4}[selected.role])return fail('coarse_classes_selection_binding');
 if(selected?.role==='input'&&(!['min_class_percent','max_classes','uniformity_percent'].every(k=>Number.isFinite(settings[k]))||typeof settings.fine_classes!=='boolean'))return fail('coarse_classes_settings_pending');
 return {verified:true,inventory_complete:true,binding_ready:true,fields,selected,settings,settings_applied:false};
}
