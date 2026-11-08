import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeVariablesColumnUnionConfigureCode(binding,options){
 validatePreparedNodeContext(binding);
 return `async page=>(${configureVariablesColumnUnion.toString()})(page,${JSON.stringify({binding,...options})},${readPreparedNodeContext.toString()},${readVariablesColumnUnionMapping.toString()})`;
}

// Only materialized local records are read. Never traverse $self, variables or
// the engine: those are remote proxies. ConnectedRecord is a local Ext model.
export function readVariablesColumnUnionMapping(prefix){
 const base=prefix+';WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard',exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const root=exact(base),fail=reason=>({verified:false,reason});
 if(root.length!==1||!root[0].checkVisibility({checkVisibilityCSS:true}))return fail('mapping_root');
 const cmp=tid=>{const es=exact(tid),c=es.length===1&&globalThis.Ext?.getCmp(es[0].id);return c?.el?.dom===es[0]&&root[0].contains(es[0])?c:null;};
 const auto=cmp(base+';btnAutoSyncThroughColumns');if(typeof auto?.pressed!=='boolean')return fail('mapping_autosync');
 const grids=['grdSourceColumns','grdTargetColumns'].map(k=>cmp(base+';'+k)),inventories=[];
 for(const grid of grids){
  const store=grid?.getStore?.(),data=store?.getData?.(),rows=data?.items,source=data?.getSource?.()?.items,proxy=store?.getProxy?.();
  if(store?.$className!=='Ext.data.Store'||store.isLoading?.()||store.isBufferedStore||!Array.isArray(rows)||rows.length>128||store.getCount()!==rows.length
   ||source&&(source.length!==rows.length||source.some(r=>!rows.includes(r)))||proxy?.pendingOperations&&Object.keys(proxy.pendingOperations).length)return fail('mapping_store');
  if(new Set(rows.map(r=>String(r.internalId))).size!==rows.length||rows.some(r=>!r.isModel||!Number.isSafeInteger(r.data?.ID)||typeof r.data.Name!=='string'
   ||typeof r.data.DisplayName!=='string'||![1,3,4,5].includes(r.data.DataType)))return fail('mapping_record');
  inventories.push(rows);
 }
 const [sources,targets]=inventories,types={1:'boolean',3:'real',4:'integer',5:'string'};
 if(targets.some(r=>r.data.ConnectedRecord!=null&&(!sources.includes(r.data.ConnectedRecord)||r.data.ConnectedRecord.data.ConnectedRecord!==r))
  ||sources.some(r=>r.data.ConnectedRecord!=null&&(!targets.includes(r.data.ConnectedRecord)||r.data.ConnectedRecord.data.ConnectedRecord!==r)))return fail('mapping_reciprocity');
 const field=(r,index)=>({record_id:String(r.internalId),id:r.data.ID,index,name:r.data.Name,label:r.data.DisplayName,type:types[r.data.DataType]});
 return {verified:true,inventory_complete:true,mapping:auto.pressed?'automatic':'manual',table:cmp(base+';rbTable')?.getValue?.()===true,sources:sources.map(field),
  fields:targets.map((r,index)=>({...field(r,index),required:r.data.Required===true,source_index:r.data.ConnectedRecord==null?null:sources.indexOf(r.data.ConnectedRecord)}))};
}

export async function configureVariablesColumnUnion(page,task,readNode=readPreparedNodeContext,readMapping=readVariablesColumnUnionMapping){
 const b=task.binding,root=b.workflow_ref.prefix+';WizrdMCF',base=root+';DerivedVariablesMappingEngineOutputPortWizard';
 const need=(v,m)=>{if(!v)throw Error('Variables union '+m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 let owner,effect=false,phase='inventory';
 const remaining=()=>{const n=task.deadline-Date.now();need(n>0,'original deadline expired');return n;};
 const owned=async()=>{remaining();const c=await readNode(page,b);need(c.verified&&c.surface==='wizard'&&!c.input_port&&!c.output_port,'owned output wizard required');need(!owner||same(owner,c),'owner changed');owner??=c;return c;};
 const inventory=async ready=>{
  const end=Math.min(task.deadline,Date.now()+15000);let previous;
  for(;;){await owned();const value=await page.evaluate(readMapping,b.workflow_ref.prefix);
   if(value.verified&&(!ready||ready(value))){const key=JSON.stringify(value);if(key===previous)return value;previous=key;}else previous=undefined;
   need(Date.now()<end,'complete mapping did not settle: '+JSON.stringify(value));await page.waitForTimeout(Math.min(100,remaining()));
  }
 };
 // Every gesture retains the prepared node, rendered data-tid, native record,
 // modal owner and hit target. Unknown acknowledgments are never replayed.
 const point=async(tid,{record,cell,editor_record,dialog=false}={})=>{
  await owned();return page.evaluate(({tid,record,cell,editor_record,dialog,root,base,origin,build})=>{
   const need=(v,m)=>{if(!v)throw Error('Variables union '+m);},visible=e=>e.checkVisibility({checkVisibilityCSS:true}),exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
   need(location.origin===origin&&globalThis.bg?.app?.Version===build,'origin/build');
   const roots=exact(root),dialogs=[...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog')].filter(visible);
   need(roots.length===1&&visible(roots[0])&&(dialog?dialogs.length===1&&dialogs[0].getAttribute('data-tid')==='EditVariableForm':dialogs.length===0),'wizard/modal owner');
   if(dialog){const c=Ext.getCmp(dialogs[0].id),native=c?.Controller,records=Object.getOwnPropertyDescriptor(native??{},'Records')?.value;
    need(c?.$className==='bg.wizards.variables.view.EditVariableForm'&&native?.FView?.el?.dom===dialogs[0]&&Array.isArray(records)&&records.length===1&&records[0].isModel&&Ext.WindowManager?.front===c,'native metadata editor owner');}
   let elements=exact(tid).filter(visible);
   if(record){
    const gs=exact(base+';grdTargetColumns'),g=gs.length===1&&Ext.getCmp(gs[0].id),rows=g?.getStore?.().getData?.()?.items,r=rows?.find(r=>String(r.internalId)===record),view=g?.getView?.(),row=r&&view?.getNode(r);
    need(row&&view.getRecord(row)===r,'retained target record');elements=cell?[...row.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid').startsWith(base+';'+cell)):elements.filter(e=>row.contains(e));
   }
   need(elements.length===1,'unique rendered control '+tid);const e=elements[0];
   let editor=false;
   if(editor_record){const gs=exact(base+';grdTargetColumns'),g=gs.length===1&&Ext.getCmp(gs[0].id),context=g?.findPlugin?.('cellediting')?.context;
    editor=String(context?.record?.internalId)===editor_record&&context?.column?.dataIndex==='SourceDisplayName'&&tid.startsWith(base+';');}
   need(roots[0].contains(e)||dialog&&dialogs[0].contains(e)||editor,'control owner');
   const box=e.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);
   need(box.width>0&&box.height>0&&!e.closest('.x-item-disabled')&&!e.disabled&&(hit===e||e.contains(hit)),'enabled hit target '+tid);return {x,y};
  },{tid,record,cell,editor_record,dialog,root,base,origin:task.origin,build:task.build});
 };
 const click=async(tid,opts={})=>{phase=tid;const p=await point(tid,opts);effect=true;await page.mouse.click(p.x,p.y);};
 const fill=async(tid,value)=>{await point(tid,{dialog:true});const input=at(tid).locator('input:visible');need(await input.count()===1,'one metadata input');effect=true;await input.fill(value,{timeout:remaining()});await input.press('Tab',{timeout:remaining()});};
 const choose=async(tid,value)=>{
  await click(tid+';trg_picker',{dialog:true});await owned();
  const option=await page.evaluate(({tid,value})=>{
   const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')],c=es.length===1&&Ext.getCmp(es[0].id),picker=c?.picker,store=picker?.getStore?.(),rows=store?.getData?.()?.items;
   if(!picker?.el?.dom?.checkVisibility({checkVisibilityCSS:true})||!Array.isArray(rows)||store.isLoading?.())throw Error('Owned type picker');
   const matches=rows.filter(r=>r.data[c.valueField]===value);if(matches.length!==1)throw Error('Unique native type');
   const e=picker.getNode(matches[0]);if(!e||picker.getRecord(e)!==matches[0]||!e.getAttribute('data-tid'))throw Error('Native type option');
   return e.getAttribute('data-tid');
  },{tid,value});
  // The option portal belongs to this opened combo; its node was bound above.
  effect=true;await at(option).click({timeout:remaining()});
 };
 try{
  let state=await inventory();
  if(state.sources.length!==task.source_fields.length){await click(base+';btnGetSourceColumns');state=await inventory(s=>s.sources.length===task.source_fields.length);}
  need(state.sources.every((s,i)=>s.type===task.source_fields[i].type&&s.label===task.source_fields[i].label),'complete ordered input schemas changed');
  const project=s=>s.fields.map(f=>{
   const source=task.source_fields[f.source_index];need(source,'every manual output must be connected');
   need(f.type===source.type||source.type==='integer'&&f.type==='string','unsupported saved conversion');
   return {input:source.input,source:source.name,name:f.name,label:f.label,type:f.type};
  });
  const requested=task.parameters.column_union;
  if(requested?.mapping==='manual'){
   const wanted=requested.fields.map(f=>{const matches=task.source_fields.flatMap((s,index)=>s.input===f.input&&s.name===f.source?[{...s,index}]:[]);need(matches.length===1,'unique requested source');const s=matches[0];need(s.type===f.type||s.type==='integer'&&f.type==='string','only same type or integer to string');return {...f,source_index:s.index};});
   if(!state.table){await click(base+';rbTable');state=await inventory(s=>s.table);}
   if(state.mapping==='automatic')await click(base+';btnAutoSyncThroughColumns');
   state=await inventory(s=>s.mapping==='manual');
   // A complete manual replacement creates unconnected typed definitions, then
   // links through the native source combo, avoiding editing a connected type.
   for(const f of [...state.fields].reverse()){
    need(!f.required,'required output cannot be replaced');await click(base+';colTargetDelete_',{record:f.record_id,cell:'colTargetDelete_'});
    state=await inventory(s=>!s.fields.some(x=>x.record_id===f.record_id));
   }
   for(const f of wanted){
    await click(base+';btnAddMappingColumn');await at('EditVariableForm').waitFor({state:'visible',timeout:remaining()});
    await fill('EditVariableForm;edtName',f.name);await fill('EditVariableForm;edtDisplayName',f.label);
    await choose('EditVariableForm;cbxDataType',({integer:4,real:3,string:5,boolean:1})[f.type]);
    await click('EditVariableForm;btnApply',{dialog:true});
    state=await inventory(s=>s.fields.length===wanted.indexOf(f)+1&&s.fields.at(-1)?.name===f.name&&s.fields.at(-1)?.type===f.type);
    const added=state.fields.at(-1);await click(base+';colSourceDisplayName_',{record:added.record_id,cell:'colSourceDisplayName_'});
    const combo=await page.evaluate(base=>{
     const es=[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getAttribute('data-tid').startsWith(base+';')&&Ext.getCmp(e.id)?.isComboBox===true);
     if(es.length!==1)throw Error('Unique source cell editor');return es[0].getAttribute('data-tid');
    },base);
    await click(combo+';trg_picker',{editor_record:added.record_id});
    const selected=await page.evaluate(({base,index})=>{
     const combos=[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getAttribute('data-tid').startsWith(base+';')&&Ext.getCmp(e.id)?.isComboBox===true);
     for(const el of combos){const c=Ext.getCmp(el.id),picker=c.picker,rows=picker?.getStore?.()?.getData?.()?.items;if(!picker?.el?.dom?.checkVisibility({checkVisibilityCSS:true})||!Array.isArray(rows))continue;
      const sources=[...document.querySelectorAll('[data-tid='+JSON.stringify(base+';grdSourceColumns')+']')],source=sources.length===1&&Ext.getCmp(sources[0].id)?.getStore?.().getData?.()?.items?.[index];
      const matches=rows.filter(r=>r.data.Value===source);if(matches.length!==1)throw Error('Unique source picker record');const node=picker.getNode(matches[0]);if(!node||picker.getRecord(node)!==matches[0]||!node.getAttribute('data-tid')||Number(node.getAttribute('data-recordindex'))!==rows.indexOf(matches[0]))throw Error('Source picker option identity');return {tid:node.getAttribute('data-tid'),index:rows.indexOf(matches[0])};
     }throw Error('Owned source combo unavailable');
    },{base,index:f.source_index});
    await owned();effect=true;await page.locator('[data-tid='+JSON.stringify(selected.tid)+'][data-recordindex="'+selected.index+'"]:visible').click({timeout:remaining()});
    state=await inventory(s=>s.fields.at(-1)?.source_index===f.source_index);
   }
   need(same(project(state),requested.fields),'complete ordered manual readback differs');
  }else if(requested?.mapping==='automatic'&&state.mapping!=='automatic'){
   await click(base+';btnAutoSyncThroughColumns');state=await inventory(s=>s.mapping==='automatic');
  }
  const configuration={verified:true,inventory_complete:true,node_context:await owned(),mapping:state.mapping,
   ...(state.mapping==='manual'?{fields:project(state)}:{})};
  if(task.finish!=='close'){
   await click(root+';btnNext');await at(root+';DoneWizard').waitFor({state:'visible',timeout:remaining()});
  }
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,node_context:await owned(),configuration};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:!effect,node_context:owner,error:'['+phase+'] '+error.message};}
}
