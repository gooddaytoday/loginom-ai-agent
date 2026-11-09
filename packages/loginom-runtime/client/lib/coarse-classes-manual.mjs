const need=(v,m)=>{if(!v)throw Error('Coarse classes manual: '+m);};
export async function configureManualCoarseClasses(channel,{input_field,cut}){
 const stage=s=>s.wizard?.stage==='coarse_classes_model';
 const one=(s,tid,verb)=>{const es=s.ui.elements.filter(e=>(e.tid===tid||e.tid===null&&e.identity?.anchor_tid===tid&&e.signature?.tag==='input')&&e.allowed_actions.includes(verb));need(es.length===1,'one owned control required: '+tid);return es[0];};
 let s=await channel.observe({condition:'manual class editor available',ready:stage});
 const activation=s.wizard.root_tid+';CoarseClassesWizard-2;btnActivationPortVisualizer';
 if(s.ui.elements.some(e=>e.tid===activation&&e.label==='Активировать')){
  await channel.perform({condition:'activate current class editor input',initialObservation:s,ready:stage,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:one(s,activation,'click').ref})});
 }
 const read=(condition,ready=()=>true)=>channel.observe({condition,readCoarseClasses:true,ready:s=>stage(s)&&s.node_coarse_classes?.verified===true&&s.node_coarse_classes.model?.input_field===input_field&&ready(s.node_coarse_classes.model)});
 s=await read('complete native classes before manual edit');
 const base=s.wizard.root_tid+';CoarseClassesWizard-2;CoarseClassesEditor;';
 const act=async(suffix,verb='click',extra={})=>{
  const tid=base+suffix;
  await channel.perform({condition:'manual classes '+suffix,initialObservation:s,ready:stage,identity:s=>s.prepared_node_context,
   resolve:s=>({verb,ref:one(s,tid,verb).ref,...extra})});
  s=await read('manual class gesture settled');
 };
 need(s.node_coarse_classes.model.classes.length>=2,'at least two native classes required for a manual cut');
 await act('btnAllowClassModifying');
 while(s.node_coarse_classes.model.classes.length>2){
  const count=s.node_coarse_classes.model.classes.length;
  await act('colCoarseClassIndex_1');await act('btnMergeWithRight');
  s=await read('native class merge completed',m=>m.classes.length===count-1);
 }
 await act('colCoarseClassHighBorder_0','double_click');
 await act('grdBinning;tbl;celleditor;num','fill',{text:String(cut)});
 await act('grdBinning;tbl;celleditor;num','press',{key:'Enter'});
 s=await read('manual cut readback',m=>m.classes.length===2&&m.classes[0].lower===null&&m.classes[0].upper===cut&&m.classes[1].lower===cut&&m.classes[1].upper===null);
 await act('btnModifyOk');
 if(!s.node_coarse_classes.model.locked)await act('colColumnUsePrevBinning_'+input_field);
 s=await read('manual partition saved without automatic recomputation',m=>m.locked===true&&m.classes.length===2&&m.classes[0].upper===cut&&m.classes[1].lower===cut);
 return structuredClone(s.node_coarse_classes.model);
}

export async function configureFrozenCoarseClasses(channel,{input_field}){
 const stage=s=>s.wizard?.stage==='coarse_classes_model';
 let s=await channel.observe({condition:'frozen class editor available',ready:stage});
 const activation=s.wizard.root_tid+';CoarseClassesWizard-2;btnActivationPortVisualizer';
 const one=(s,tid)=>{const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes('click'));need(es.length===1,'one owned control required: '+tid);return es[0];};
 if(s.ui.elements.some(e=>e.tid===activation&&e.label==='Активировать'))await channel.perform({condition:'activate frozen class editor input',initialObservation:s,ready:stage,identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:one(s,activation).ref})});
 const read=condition=>channel.observe({condition,readCoarseClasses:true,ready:s=>stage(s)&&s.node_coarse_classes?.verified===true&&s.node_coarse_classes.model?.input_field===input_field});
 s=await read('native partition before freeze');
 const before=structuredClone(s.node_coarse_classes.model.classes);
 if(!s.node_coarse_classes.model.locked){
  const tid=s.wizard.root_tid+';CoarseClassesWizard-2;CoarseClassesEditor;colColumnUsePrevBinning_'+input_field;
  await channel.perform({condition:'freeze native partition',initialObservation:s,ready:stage,identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:one(s,tid).ref})});
 }
 s=await read('native IsLocked readback');
 need(s.node_coarse_classes.model.locked===true&&JSON.stringify(s.node_coarse_classes.model.classes)===JSON.stringify(before),'freeze must retain native classes and IsLocked=true');
 return structuredClone(s.node_coarse_classes.model);
}
