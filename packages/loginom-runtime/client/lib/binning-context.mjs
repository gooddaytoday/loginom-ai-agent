import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeBinningContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readBinningContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readBinningBrowser.toString()})`;}
export async function readBinningContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readBinningBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'binning_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'binning_owner_changed'};
 return {...result,node_context:after};
}
// LAB-654 discovery: numeric rows carry Index/DisplayName, not Name. Bind them
// to the complete input mapping in the procedure. Never read Column/Engine RPC.
export function readBinningBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;MethodSettingsWizard-1';
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=exact(base);if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('binning_root');
 const root=roots[0],view=globalThis.Ext?.getCmp?.(root.id),c=view?.['@@TestCmpController'];
 const cmp=(tid,owner=root)=>{const es=exact(tid).filter(e=>owner.contains(e));if(es.length!==1)return null;const v=globalThis.Ext?.getCmp?.(es[0].id);return v?.el?.dom===es[0]?v:null;};
 const rows=s=>{const d=s?.getData?.(),rs=d?.items,source=d?.getSource?.()?.items;return s?.$className==='Ext.data.Store'&&!s.isBufferedStore&&!s.isLoading?.()&&Array.isArray(rs)&&rs.length<=1000&&s.getCount?.()===rs.length&&(!source||source.length===rs.length&&source.every(r=>rs.includes(r)))?rs:null;};
 const grid=cmp(base+';grdColumns'),store=grid?.getStore?.(),rs=rows(store);
 if(!rs||view?.el?.dom!==root||c?.constructor?.name!=='MethodSettingsWizard'||c.FGrdColumns!==grid||c.FInputColumnStore!==store)return fail('binning_inventory_owner');
 const wizard=exact(prefix+';WizrdMCF'),w=wizard.length===1?globalThis.Ext?.getCmp?.(wizard[0].id):null;
 if(!w||c.FWizardForm?.FView!==w)return fail('binning_wizard_owner');
 const queues=Object.getOwnPropertySymbols(w).filter(s=>s.description==='LockQueue');
 if(queues.length!==1||w[queues[0]]?.IsEmpty!==true||c.FBinsReloading===true)return fail('binning_pending');
 // Reopening after Train can expose the owned store before numeric rows arrive.
 if(rs.length===0)return fail('binning_fields_pending');
 const fields=[],ids=new Set(),indices=new Set(),types={2:'datetime',3:'real',4:'integer'};
 for(const r of rs){const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||!Number.isInteger(d?.Index)||d.Index<0||indices.has(d.Index)||typeof d.DisplayName!=='string'||!types[d.DataType]||![0,2,3,4,5].includes(d.MethodType)||!Number.isInteger(d.BinsCount)||d.BinsCount<0||typeof d.AlwaysDefaultSettings!=='boolean')return fail('binning_field');
  ids.add(id);indices.add(d.Index);fields.push({index:d.Index,record_id:id,label:d.DisplayName,type:types[d.DataType],method_code:d.MethodType,bins_count:d.BinsCount,automatic:d.AlwaysDefaultSettings});
 }
 const selection=grid.getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selection)||selection.length>1||selection.some(r=>!rs.includes(r))||(selection[0]??null)!==(c.FViewedColumnRecord??null))return fail('binning_selection_pending');
 const selected=selection.length?fields[rs.indexOf(selection[0])]:null;
 const plugin=grid.editingPlugin,context=plugin?.context,editor=plugin?.editing===true?plugin.activeEditor:null;
 if(editor&&(!rs.includes(context?.record)||context.grid!==grid||context.field!=='MethodType'||context.record!==selection[0]||!root.contains(editor.el?.dom)))return fail('binning_editor_owner');
 const method_editor=editor?{record_id:String(context.record.internalId),root_tid:editor.el.dom.getAttribute('data-tid')}:null;
 let frame=null,settings=null;
 const frames=Object.values(c.FMethodSettingFrames??{}).filter(f=>selection.length===1&&f?.FInputColumnRecord===selection[0]&&f.FView?.el?.dom?.checkVisibility({checkVisibilityCSS:true}));
 if(frames.length>1)return fail('binning_frame_ambiguous');
 if(frames.length){
  const f=frames[0],el=f.FView.el.dom;
  if(f.FOwner!==c||!root.contains(el)||el.getAttribute('data-tid')!=='MethodSettingFrame')return fail('binning_frame_owner');
  const values={},controls={},switches=[];
  const names=['chkLowerLimitOpen;ValueControl','chkUpperLimitOpen;ValueControl','chkRoundingLevel',
   ...(selected.method_code===3?['chkStrictLowerLimit','chkStrictUpperLimit','cbbCountBins;ValueControl']:selected.method_code===2?['chkStrictLowerLimit','chkStrictUpperLimit','edtBinWidth;ValueControl']:selected.method_code===4?['cbbTileCount;ValueControl','cbbMatchingObservationsMode;ValueControl','chkSummTile;ValueControl']:[])];
  for(const key of names){const v=cmp('MethodSettingFrame;'+key,el);if(!v||typeof v.getValue!=='function')return fail('binning_control:'+key);values[key]=v.getValue();controls[key]='MethodSettingFrame;'+key;}
  if([2,3].includes(selected.method_code))for(const key of ['edtLowerLimit','edtUpperLimit']){
   const candidates=['ValueContainer;num','ValueContainer;Int64Field'].map(k=>cmp('MethodSettingFrame;'+key+';'+k,el)).filter(v=>v?.el?.dom?.checkVisibility({checkVisibilityCSS:true}));
   if(candidates.length!==1)return fail('binning_bound_control');
   const v=candidates[0],value=v.getValue();values[key]=typeof value==='string'&&/^-?\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):value;controls[key]=v.el.dom.getAttribute('data-tid');
  }
  for(const e of el.querySelectorAll('[data-tid$=";SwitchButton"]'))if(globalThis.Ext?.getCmp?.(e.id)?.pressed===true)switches.push(e.getAttribute('data-tid'));
  const method={2:'width',3:'count',4:'frequency'}[selected.method_code];
  frame={record_id:selected.record_id,controls,values,switches};
  settings={method,size:values[method==='count'?'cbbCountBins;ValueControl':method==='width'?'edtBinWidth;ValueControl':'cbbTileCount;ValueControl'],
   limits:method==='frequency'?null:[values.edtLowerLimit,values.edtUpperLimit],strict_lower:values.chkStrictLowerLimit??false,strict_upper:values.chkStrictUpperLimit??false,
   rounding:values.chkRoundingLevel,lower_open:values['chkLowerLimitOpen;ValueControl'],upper_open:values['chkUpperLimitOpen;ValueControl'],
   ...(method==='frequency'?{ties:values['cbbMatchingObservationsMode;ValueControl']===0?'next':'unsupported',sums:values['chkSummTile;ValueControl']}:{} )};
 }
 const binGrid=cmp(base+';grdBins'),binRows=rows(c.FBinItemsStore),intervals=[];
 if(!binRows||binGrid?.getStore?.()!==c.FBinItemsStore)return fail('binning_bins_inventory');
 if(selected?.bins_count>0){
  if(binRows.length!==selected.bins_count)return fail('binning_bins_pending');
  for(const [i,r] of binRows.entries()){const d=r?.data;
   if(!r?.isModel||d.ColIndex!==selected.index||d.BinIndex!==i||d.BinNumber!==i||typeof d.BinLabel!=='string'||![0,1,2,3].includes(d.BoundModes)||!Number.isFinite(d.LowerBoundValue)||!Number.isFinite(d.UpperBoundValue)||d.InvalidMode!==0||d.LowerBoundInvalid!==false||d.UpperBoundInvalid!==false||d.BoundModeInvalid!==false)return fail('binning_interval');
   intervals.push({number:i,lower:d.LowerBoundValue,upper:d.UpperBoundValue,label:d.BinLabel,lower_included:(d.BoundModes&1)!==0,upper_included:(d.BoundModes&2)!==0});
  }
 }
 return {verified:true,inventory_complete:true,binding_ready:true,fields,selected,method_editor,frame,settings,intervals,state:selected?.bins_count>0?'materialized':'settings',state_source:'cached_binning_ui',settings_applied:false};
}
