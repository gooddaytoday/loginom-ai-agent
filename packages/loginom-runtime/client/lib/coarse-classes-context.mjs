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
 const roots=exact(base),root=roots[0];
 if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true}))return fail('coarse_classes_root');
 const cmp=t=>{const es=exact(t),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]&&root.contains(es[0])?c:null;};
 const wizard=exact(prefix+';WizrdMCF'),w=wizard.length===1?globalThis.Ext?.getCmp?.(wizard[0].id):null;
 const view=globalThis.Ext?.getCmp?.(root.id),controller=view?.['@@TestCmpController'];
 if(view?.el?.dom!==root||!controller||controller.FWizardForm?.FView!==w)return fail('coarse_classes_page_owner');
 const queues=Object.getOwnPropertySymbols(w).filter(s=>s.description==='LockQueue');
 if(queues.length!==1||w[queues[0]]?.IsEmpty!==true)return fail('coarse_classes_pending');
 const g=cmp(base+';grdColumns'),store=g?.getStore?.(),data=store?.getData?.(),rs=data?.items,source=data?.getSource?.()?.items;
 if(controller.constructor?.name!=='CoarseClassesWizard'||controller.FColumnsStore!==store||store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||!Array.isArray(rs)||!rs.length||rs.length>1000||store.getCount?.()!==rs.length||source&&(source.length!==rs.length||source.some(r=>!rs.includes(r))))return fail('coarse_classes_field_inventory');
 const selection=g.getSelectionModel?.().getSelection?.();
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
 const eventPaths=['cbxEventValue;ValueContainer;txt','cbxEventValue;ValueContainer;txt-1','cbxEventValue;ValueContainer;cbx'];
 const events=eventPaths.map(path=>({path,control:cmp(controlBase+path)})).filter(e=>e.control?.el?.dom?.checkVisibility({checkVisibilityCSS:true}));
 if(events.length>1)return fail('coarse_classes_event_ambiguous');
 const event=events[0];
 settings.event_control=event?.path??null;
 settings.event_value=event?(event.path.endsWith(';cbx')?event.control.getRawValue?.():event.control.getValue?.()):null;
 if(selected?.role==='target'&&typeof settings.event_value!=='string')return fail('coarse_classes_event_pending');
 if(selected&&settings.role!=={unused:0,input:1,target:4}[selected.role])return fail('coarse_classes_selection_binding');
 if(selected?.role==='input'&&(!['min_class_percent','max_classes','uniformity_percent'].every(k=>Number.isFinite(settings[k]))||typeof settings.fine_classes!=='boolean'))return fail('coarse_classes_settings_pending');
 return {verified:true,inventory_complete:true,binding_ready:true,fields,selected,settings,settings_applied:false};
}
