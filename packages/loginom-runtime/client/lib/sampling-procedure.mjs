const need=(v,m)=>{if(!v)throw Error('Sampling selection: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function sequentialGroup(row,partition){
 const labels=[row.text,...Object.values(row.values).filter(v=>typeof v==='string')].join(' ').toLowerCase();
 if(/неиспольз|неотобран|остаток/.test(labels))return 'unused';
 if(partition){if(/тестов/.test(labels))return 'test';if(/обуча/.test(labels))return 'train';}
 if(/выборк|отобран|сэмпл|выбран/.test(labels))return 'sample';
 throw Error('Unrecognized native sequential group: '+JSON.stringify(row));
}
export function sequentialSizes(configuration){
 const expected=configuration.kind==='data_partition'?2:1;
 need(Array.isArray(configuration.units)&&configuration.units.length===expected,'complete native size controls required');
 return configuration.units.map(u=>{
  need(configuration.sizes.some(r=>r.record_id===u.record_id)&&Number.isSafeInteger(u.absolute_size)&&u.absolute_size>=0,'absolute size control binding differs');return u.absolute_size;
 });
}
export async function configureSampling(channel,p,{request,inputMapping}){
 const ready=s=>['sampling','data_partition'].includes(s.wizard?.stage)&&s.node_sampling?.verified===true;
 const observe=condition=>channel.observe({condition,readSampling:true,ready});
 let s=await observe('complete sequential selection settings'),before=s.node_sampling;
 if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:before,draft_edits_skipped:true};
 need(inputMapping?.verified&&inputMapping.inventory_complete,'complete input mapping required');
 const mode=request.mode??'sequential',method={sequential:'Последовательный',random:'Случайный',stratified:'Стратифицированный',biased:'Отбор со смещением'}[mode];
 need(method,'unsupported sampling method');
 const partition=before.kind==='data_partition',base=before.base,sizesBase=(before.sizes_base??base+'SizeGridForm')+';';
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const act=async(condition,predicate,action)=>{s=await observe(condition);await channel.perform({condition,initialObservation:s,ready,identity:s=>s.prepared_node_context,resolve:s=>({...action,ref:one(s,predicate,condition+' control unavailable').ref})});};
 const tid=(key,verb)=>e=>(e.tid===base+key||e.identity?.anchor_tid===base+key)&&e.allowed_actions.includes(verb);
 if(before.method!==method){
  await act('open sampling method',tid('pedSamplingMethod;ValueControl;trg_picker','click'),{verb:'click'});
  s=await channel.observe({condition:'sequential method option',readSampling:true,ready:s=>ready(s)&&s.ui.elements.some(e=>e.label===method&&e.allowed_actions.includes('click')&&(e.role==='option'||e.tid?.includes(';boundlist;')))});
  await channel.perform({condition:'select sequential method',initialObservation:s,ready,identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:one(s,e=>e.label===method&&e.allowed_actions.includes('click')&&(e.role==='option'||e.tid?.includes(';boundlist;')),'sequential option').ref})});
  s=await observe('sequential method applied');need(s.node_sampling.method===method,'method differs');
 }
 if(mode==='sequential')need(s.node_sampling.sequence_materialized!==false,'sequential form is not materialized');
 const sequenceBase=(s.node_sampling.sequence_base??base+'SequenceMethodForm')+';';
 const counts=partition?[p.train_count,p.test_count]:[p.count];
 for(const [index,count] of counts.entries()){
  if(count===undefined)continue;
  // Unit icon and editable cell are bound to the actual observed row tid.
  s=await observe('sampling size unit');
  const unit=s.ui.elements.filter(e=>e.ref===s.node_sampling.units[index].icon_ref&&e.signature?.tag==='img'&&e.role==='button'&&e.allowed_actions.includes('click'));
  need(unit.length===1,'unique size unit icon required');
  const observed=s.node_sampling.units[index];
  need(['rows','percent'].includes(observed.unit),'native size unit required');
  if(observed.unit==='percent')await act('switch sampling size to rows',e=>e.ref===unit[0].ref,{verb:'click'});
  s=await observe('sampling absolute size control');
  const current=s.node_sampling.units[index];need(current.unit==='rows','size unit did not settle to rows');
  const editorTid=current.absolute_control_tid;
  need(typeof editorTid==='string'&&editorTid.startsWith(sizesBase+'colAbsoluteSize;'),'owned absolute size editor required');
  const editor=e=>(e.tid===editorTid||e.identity?.anchor_tid===editorTid)&&e.allowed_actions.includes('fill');
  await act('fill sampling row count',editor,{verb:'fill',text:String(count)});
  await act('commit sampling row count',e=>editor(e)&&e.allowed_actions.includes('press'),{verb:'press',key:'Tab'});
  s=await observe('sampling row count committed');need(sequentialSizes(s.node_sampling)[index]===count,'row count differs');
 }
 if(mode!=='sequential')await configureSamplingMode(channel,p,{request,inputMapping,base,partition,observe,act});
 s=await observe('sequential groups before reordering');
 const original=s.node_sampling.sequence.map(r=>sequentialGroup(r,partition));
 need(new Set(original).size===original.length,'unique sequential groups required');
 const order=mode!=='sequential'?null:partition?(p.allocation_order==='test_train_unused'?['test','train','unused']:null)
  :p.position==='first'?['sample','unused']:p.position==='last'?['unused','sample']:null;
 if(order)for(const [index,group] of order.entries()){
  s=await observe('sequential group position');
  while(s.node_sampling.sequence.findIndex(r=>sequentialGroup(r,partition)===group)>index){
   const row=s.node_sampling.sequence.find(r=>sequentialGroup(r,partition)===group);need(row,'group missing');
   await act('select exact sequential group',e=>e.tid===row.tids.find(tid=>s.ui.elements.some(e=>e.tid===tid&&e.allowed_actions.includes('click')))&&e.allowed_actions.includes('click'),{verb:'click'});
   s=await observe('sequential group selected');need(s.node_sampling.sequence.filter(r=>r.selected).length===1&&s.node_sampling.sequence.find(r=>r.selected).record_id===row.record_id,'group selection differs');
   const old=s.node_sampling.sequence.map(r=>sequentialGroup(r,partition)),at=old.indexOf(group);[old[at-1],old[at]]=[old[at],old[at-1]];
   await act('move sequential group up',e=>e.tid===sequenceBase+'btnGroupPositionUp'&&e.allowed_actions.includes('click'),{verb:'click'});
   s=await observe('group order readback');need(same(s.node_sampling.sequence.map(r=>sequentialGroup(r,partition)),old),'group movement differs');
  }
 }
 s=await observe('complete sequential settings readback');const c=s.node_sampling;
 need(c.method===method&&original.length===c.sequence.length&&original.every(group=>c.sequence.filter(a=>sequentialGroup(a,partition)===group).length===1),'group identity changed');
 if(order)need(same(c.sequence.map(r=>sequentialGroup(r,partition)),order),'allocation order differs');
 need(c.units.every(u=>u.unit==='rows'),'sequential sizes must use rows');
 const sizes=sequentialSizes(c);for(const [i,count] of counts.entries())if(count!==undefined)need(sizes[i]===count,'final size differs');
 const configuration={...c,mode,new_node:request.target.kind==='new',input_fields:inputMapping.target_fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind})),counts:sizes,groups:c.sequence.map(r=>sequentialGroup(r,partition))};
 await channel.perform({condition:'validate sequential selection',initialObservation:s,ready,identity:s=>s.prepared_node_context,resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Next unavailable').ref,expected_stage:['output_mapping','done']})});
 let destination=await channel.observe({condition:'sequential selection destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
 if(destination.wizard.stage==='output_mapping'){
  await channel.perform({condition:'preserve sequential output mapping',initialObservation:destination,ready:s=>s.wizard?.stage==='output_mapping',identity:s=>s.prepared_node_context,resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'mapping Next unavailable').ref,expected_stage:'done'})});
 }
 destination=await channel.observe({condition:'sequential settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration,validation:{status:'accepted_by_loginom_next',node_context:destination.prepared_node_context}};
}

async function configureSamplingMode(channel,p,{request,inputMapping,base,partition,observe,act}){
 const at=(key,verb)=>e=>(e.tid===key||e.identity?.anchor_tid===key)&&e.allowed_actions.includes(verb);
 const fill=async(key,value)=>{
  await act('set sampling parameter',at(key,'fill'),{verb:'fill',text:String(value)});
  await act('commit sampling parameter',at(key,'press'),{verb:'press',key:'Tab'});
 };
 let c=(await observe('sampling method settings')).node_sampling;
 if(p.seed!==undefined){
  await fill(base+'RandSeedEdit;edtRandSeed;ValueControl',p.seed);
  c=(await observe('sampling seed readback')).node_sampling;
  need(c.seed===p.seed,'seed differs');
 }
 need(Number.isInteger(c.seed)&&c.seed>=0,'explicit retained seed required');
 if(partition)need(c.test_priority===false,'only disabled test priority is supported');
 const field=name=>{
  const fs=inputMapping.target_fields.filter(f=>f.name===name&&!f.excluded);
  need(fs.length===1&&fs[0].data_kind==='Дискретный','observed discrete input field required: '+name);
  return fs[0];
 };
 if(request.mode==='stratified'){
  const rows=c.strata?.rows;need(Array.isArray(rows),'complete strata inventory required');
  for(const f of p.strata_fields??[])field(f.name);
  const selected=p.strata_fields?.map(f=>f.name);
  for(const row of rows){
   const name=row.values.Name;
   need(typeof name==='string'&&typeof row.values.UsageFlag==='boolean','native strata field identity and flag required');
   const wanted=selected?selected.includes(name):row.values.UsageFlag;
   if(wanted===row.values.UsageFlag)continue;
   const key=c.strata.base+';grdStratifiedGrid;headercontainer;UsageFlag_'+name;
   await act('toggle exact strata field',at(key,'click'),{verb:'click'});
   c=(await observe('strata field readback')).node_sampling;
   need(c.strata.rows.find(r=>r.record_id===row.record_id)?.values.UsageFlag===wanted,'strata flag differs');
  }
  for(const row of c.strata.rows)if(row.values.UsageFlag)field(row.values.Name);
  const active=c.strata.rows.filter(r=>r.values.UsageFlag).map(r=>r.values.Name);
  need(active.length>0&&(!selected||active.length===selected.length&&selected.every(n=>active.includes(n))),'strata selection differs');
 }
 if(request.mode==='biased'){
  need(Array.isArray(c.bias_fields?.rows)&&Array.isArray(c.bias?.rows),'complete biased selection inventory required');
  if(p.bias_field){
   need(field(p.bias_field.name).type==='string','initial biased slice requires a string field');
   const row=c.bias_fields.rows.filter(r=>r.values.Name===p.bias_field.name);need(row.length===1,'bias field not observed');
   await act('select exact bias field',at(c.bias_fields.base+';colDisplayName_'+p.bias_field.name,'click'),{verb:'click'});
   c=(await observe('bias field readback')).node_sampling;
   need(c.bias_fields.rows.filter(r=>r.selected).length===1&&c.bias_fields.rows.find(r=>r.selected).values.Name===p.bias_field.name,'bias field selection differs');
  }
  const used=c.bias_fields.rows.filter(r=>r.selected);
  need(used.length===1&&field(used[0].values.Name).type==='string','one retained discrete string bias field required');
  if(p.bias_factors){
   await act('read biased categories',at(c.bias.base+';btnGetUniqueValues','click'),{verb:'click'});
   c=(await observe('complete biased categories')).node_sampling;
   const categories=()=>c.bias.rows.map(r=>({row:r,value:r.values.Value,factor:r.values.Factor}));
   need(categories().length===p.bias_factors.length&&categories().every(r=>typeof r.value==='string'&&Number.isFinite(r.factor)&&p.bias_factors.filter(f=>f.value===r.value).length===1),'complete factors must match observed categories');
   for(const wanted of p.bias_factors){
    const current=categories().find(r=>r.value===wanted.value);if(current.factor===wanted.factor)continue;
    const index=c.bias.rows.findIndex(r=>r.record_id===current.row.record_id);
    await act('select exact bias category',at(c.bias.base+';colBiasedValue_'+index,'click'),{verb:'click'});
    c=(await observe('bias category selection')).node_sampling;
    need(c.bias.rows.filter(r=>r.selected).length===1&&c.bias.rows.find(r=>r.selected).record_id===current.row.record_id,'category selection differs');
    await act('edit owned bias factor',at(c.bias.base+';btnBiasedEdit','click'),{verb:'click'});
    const dialog=base.slice(0,base.indexOf(';WizrdMCF;'))+';WizrdMCF;FactorEditDialog;';
    await fill(dialog+'fldFactor',wanted.factor);
    await act('apply owned bias factor',at(dialog+'btnApply','click'),{verb:'click'});
    c=(await observe('bias factor readback')).node_sampling;
    need(categories().find(r=>r.value===wanted.value)?.factor===wanted.factor,'category factor differs');
   }
   need(categories().length===p.bias_factors.length&&p.bias_factors.every(f=>categories().some(r=>r.value===f.value&&r.factor===f.factor)),'final factors differ');
  }
 }
}
