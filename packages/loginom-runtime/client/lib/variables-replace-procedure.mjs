import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {readVariablesReplaceContext,readVariablesReplaceBrowser} from './variables-replace-context.mjs';
export function variablesReplaceLocator(page,tid){return page.locator('[data-tid='+JSON.stringify(tid)+']:visible:not(tr.x-grid-row-summary *)');}
export async function revealVariablesReplaceControl(page,tid,locate=variablesReplaceLocator,timeout=15000){
 const inView=await locate(page,tid).evaluate(e=>{
  const b=e.getBoundingClientRect();
  if(!e.isConnected||b.width<=0||b.height<=0||b.left<0||b.top<0||b.right>innerWidth||b.bottom>innerHeight)return false;
  // Native grid rows can be inside the window but clipped by their scroll view.
  for(let p=e.parentElement;p;p=p.parentElement){
   const style=getComputedStyle(p),box=p.getBoundingClientRect(),left=box.left+p.clientLeft,top=box.top+p.clientTop;
   if(/auto|scroll|hidden|clip/.test(style.overflowX)&&(b.left<left||b.right>left+p.clientWidth))return false;
   if(/auto|scroll|hidden|clip/.test(style.overflowY)&&(b.top<top||b.bottom>top+p.clientHeight))return false;
  }
  return true;
 },undefined,{timeout});
 if(!inView)await locate(page,tid).scrollIntoViewIfNeeded({timeout});
}
export function makeVariablesReplaceConfigureCode(binding,options){
 validatePreparedNodeContext(binding);
 return `async page=>(${configureVariablesReplace.toString()})(page,${JSON.stringify({...options,binding})},${readPreparedNodeContext.toString()},${readVariablesReplaceContext.toString()},${readVariablesReplaceBrowser.toString()},${variablesReplaceLocator.toString()},${revealVariablesReplaceControl.toString()})`;
}
// Private UI procedure: cached native inventories, guarded rendered gestures,
// original deadline, and no retries of dispatched or unknown effects.
export async function configureVariablesReplace(page,task,readNode=readPreparedNodeContext,readContext=readVariablesReplaceContext,readBrowser=readVariablesReplaceBrowser,locate=variablesReplaceLocator,reveal=revealVariablesReplaceControl){
 let effect=false,phase='inventory',lastAction='read';
 const need=(ok,message)=>{if(!ok)throw Error('Variables replacement '+message);};
 const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b)),b=task.binding,root=b.workflow_ref.prefix+';WizrdMCF',base=root+';ReplaceVariablesWizard';
 const at=tid=>locate(page,tid);
 const remaining=()=>{const n=task.deadline-Date.now();need(n>0,'original deadline expired');return n;};
 let owner;
 const owned=async()=>{remaining();const c=await readNode(page,b);need(c.verified===true&&c.surface==='wizard'&&!c.input_port&&!c.output_port,'owned wizard required');need(!owner||same(owner,c),'owner changed');owner??=c;return c;};
 const inventory=async(ready=()=>true)=>{
  const ceiling=Math.min(task.deadline,Date.now()+15000);let previous;
  for(;;){
   await owned();const r=await readContext(page,b,readNode,readBrowser);
   need(same(r.node_context,owner),'inventory owner changed');
   if(r.verified===true&&r.inventory_complete===true&&ready(r)){
    const key=JSON.stringify(r);if(key===previous)return r;previous=key;
   }else{
    need(r.verified===true||['variables_replace_mask','variables_replace_input_inventory','variables_replace_table_inventory'].includes(r.reason),'complete inventory required: '+r.reason);previous=undefined;
   }
   need(Date.now()<ceiling,'complete inventory did not settle: '+(r.reason??'selected variable'));
   await page.waitForTimeout(Math.min(100,remaining()));
  }
 };
 const inspect=async(tid,{grid,row,dialog,input=false}={})=>{
  await owned();
  return page.evaluate(({tid,grid,row,dialog,input,root,base,origin,build})=>{
   const need=(v,m)=>{if(!v)throw Error('Variables replacement '+m);},exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')].filter(e=>!e.closest('tr.x-grid-row-summary')),visible=e=>e.checkVisibility({checkVisibilityCSS:true});
   need(location.origin===origin&&globalThis.bg?.app?.Version===build,'origin/build changed');
   const roots=exact(root);need(roots.length===1&&visible(roots[0]),'one wizard');
   const dialogs=[...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog')].filter(visible);
   need(dialog?dialogs.length===1&&dialogs[0].getAttribute('data-tid')===dialog:dialogs.length===0,'foreign dialog');
   const masks=[...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].filter(visible);
   const ruleGrid=exact(base+';grdReplaceItems')[0],cmp=ruleGrid&&globalThis.Ext?.getCmp?.(ruleGrid.id);
   need(masks.every(m=>cmp?.disabled===true&&m.parentElement===ruleGrid&&m.classList.contains('x-mask')||dialog&&!m.contains(dialogs[0])&&!dialogs[0].contains(m)),'foreign mask');
   const es=exact(tid).filter(visible);need(es.length===1,'unique visible '+tid);let e=es[0];
   need(roots[0].contains(e)||dialog&&dialogs[0].contains(e)||tid==='roweditorbuttons;update'&&ruleGrid?.contains(e)
    ||tid.startsWith(base+';')&&tid.includes(';boundlist;'),'owned rendered control');
   if(grid){
    const gs=exact(grid),g=gs.length===1&&globalThis.Ext?.getCmp(gs[0].id),records=g?.getStore?.().getData?.()?.items;
    need(g?.el?.dom===gs[0]&&Array.isArray(records),'native grid');
    const rs=records.filter(r=>String(r.internalId)===row);need(rs.length===1,'native retained row');
    const view=g.getView?.(),node=view?.getNode?.(rs[0]);need(node&&node.contains(e)&&view.getRecord(node)===rs[0],'rendered retained row');
   }
   if(input){const inputs=[...e.querySelectorAll('input,textarea')].filter(visible);need(inputs.length===1,'unique input');e=inputs[0];}
   const box=e.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);
   need(visible(e)&&box.width>0&&box.height>0&&!e.disabled&&!e.closest('.x-item-disabled')&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&(hit===e||e.contains(hit)),'enabled hit target');return {x,y};
  },{tid,grid,row,dialog,input,root,base,origin:task.origin,build:task.build});
 };
 const click=async(tid,options={},double=false)=>{lastAction=tid;await owned();await reveal(page,tid,locate,remaining());const p=await inspect(tid,options);effect=true;await page.mouse.click(p.x,p.y,{clickCount:double?2:1});};
 const fill=async(tid,text,options={})=>{lastAction=tid;await inspect(tid,{...options,input:true});const input=at(tid).locator('input:visible,textarea:visible');need(await input.count()===1,'unique input');effect=true;await input.fill(text,{timeout:remaining()});await input.press('Tab',{timeout:remaining()});};
 const mode=task.mode??'exact';
 const normalize=r=>({variable:{kind:'input_variable',name:r.selected},type:r.input_fields.find(f=>f.name===r.selected).type,pairs:r.pairs.filter(p=>p.collection_id!==1).map(p=>({from:p.from.value,to:p.to.value})),...(r.pairs.some(p=>p.collection_id===1)?{regex_pairs:r.pairs.filter(p=>p.collection_id===1).map(p=>({pattern:p.from.value,replacement:p.to.value}))}:{}),other:r.other.mode,
  ...(r.input_fields.find(f=>f.name===r.selected).type==='string'?{case_sensitive:r.case_sensitive}:['integer','real'].includes(r.input_fields.find(f=>f.name===r.selected).type)?{precision:r.precision}:{})});
 try{
  const before=await inventory(),fields=before.input_fields;
  const select=async name=>{
   const s=await inventory(),f=s.input_fields.find(f=>f.name===name);need(f,'missing variable '+name);
   if(s.selected!==name)await click(base+';colInputData_'+name,{grid:base+';grdDataList',row:f.record_id});
   return inventory(r=>r.selected===name);
  };
  const requested=task.parameters.rules??[];
  for(const r of requested)need(fields.some(f=>f.name===r.variable.name&&f.type===r.type),'unknown variable or changed input type: '+r.variable.name);
  const saved=[];
  for(const f of fields.filter(f=>f.mode==='manual'))saved.push(normalize(await select(f.name)));
  need(!task.new_node||saved.length===0,'new node has unexpected saved rules');
  for(const r of saved)need(['integer','real','string','boolean'].includes(r.type)&&(mode==='exact'?r.other==='keep'&&!r.regex_pairs&&(r.type==='string'?r.case_sensitive===true:['integer','real'].includes(r.type)?r.precision===0:true):['keep','null'].includes(r.other)&&(!r.regex_pairs||r.type==='string'&&r.pairs.length===0))&&new Set(r.pairs.map(p=>JSON.stringify(r.type==='string'&&!r.case_sensitive&&typeof p.from==='string'?p.from.toLowerCase():p.from))).size===r.pairs.length,'unsupported or duplicate saved rules');
  const effective=[...saved.map(r=>requested.find(p=>p.variable.name===r.variable.name)??r),...requested.filter(r=>!saved.some(s=>s.variable.name===r.variable.name))];
  for(const r of requested){
   phase='rules_'+r.variable.name;let state=await select(r.variable.name),field=state.input_fields.find(f=>f.name===r.variable.name);
   if(field.mode==='none'){
    await click(base+';colReplaceSource_'+field.name,{grid:base+';grdDataList',row:field.record_id});
    await click(base+';grdDataList;tbl;celleditor;cbx;boundlist;Ввод_вручную');state=await inventory();
    need(state.input_fields.find(f=>f.name===field.name).mode==='manual','manual mode not applied');
   }
   for(const p of [...state.pairs].reverse()){
    await click(base+';colReplaceDelete_'+p.index,{grid:base+';grdReplaceItems',row:p.record_id});
    state=await inventory();need(!state.pairs.some(x=>x.record_id===p.record_id),'pair deletion unconfirmed');
   }
   for(const [group,pairs] of [[0,r.pairs],[1,(r.regex_pairs??[]).map(p=>({from:p.pattern,to:p.replacement}))]])for(const pair of pairs){
    const old=state.pairs.map(p=>p.record_id);await click(base+';grdReplaceItems;tbl;GroupHeader;'+group+';AddButton');state=await inventory();
    const added=state.pairs.filter(p=>!old.includes(p.record_id));need(added.length===1&&state.pairs.length===old.length+1,'one added pair required');
    await click(base+';colReplaceValue_'+added[0].index,{grid:base+';grdReplaceItems',row:added[0].record_id},true);
    state=await inventory();need(state.editor_open,'row editor not open');
    for(const [side,value] of [['ReplaceEditor',pair.from],['ReplaceEditor-1',pair.to]]){
     const tid=base+';'+side+';fldVariant;ValueContainer;'+({integer:'Int64Field',real:'num',string:'txt',boolean:'cbx'})[r.type];
     if(value===null)await click(tid+';trg_SetNullTrigger');
     else if(r.type==='boolean'){
      await click(tid+';trg_picker');await click(tid+';boundlist;'+String(value));
     }else{
      const separator=state.real_decimal_separators?.[side==='ReplaceEditor'?'from':'to'];
      need(r.type!=='real'||['.',','].includes(separator),'observed real decimal separator required');
      await fill(tid,r.type==='real'?String(value).replace('.',separator):String(value));
     }
    }
    await click('roweditorbuttons;update');state=await inventory();
    need(!state.editor_open&&state.pairs.length===old.length+1&&same(state.pairs.at(-1).from.value,pair.from)&&same(state.pairs.at(-1).to.value,pair.to),'typed pair commit differs');
   }
   if(r.type==='string'&&state.case_sensitive!==r.case_sensitive)await click(base+';chkCaseSensitivity;DisplayEl');
   if(['integer','real'].includes(r.type)&&state.precision!==r.precision){
    need(['.',','].includes(state.precision_decimal_separator),'observed precision decimal separator required');
    await fill(base+';edPrecision',String(r.precision).replace('.',state.precision_decimal_separator));
   }
   state=await inventory();
   if(state.other.mode!==r.other){await click(base+';cbxReplaceOther;trg_picker');await click(base+';cbxReplaceOther;boundlist;'+{keep:'Не_заменять',null:'На_пропущенное'}[r.other]);}
   state=await inventory();need(same(normalize(state),r),'complete rule readback differs');
  }
  for(const rule of effective)need(same(normalize(await select(rule.variable.name)),rule),'unlisted rule changed');
  const configuration={verified:true,inventory_complete:true,mode,node_context:await owned(),input_fields:fields.map(({name,label,type})=>({name,label,type})),rules:effective};
  if(task.finish==='close')return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,node_context:owner,configuration};
  phase='mapping';await click(root+';btnNext');
  const mapping=root+';DerivedVariablesMappingEngineOutputPortWizard';await at(mapping).waitFor({state:'visible',timeout:Math.min(15000,remaining())});
  const readMapping=async(ready=()=>true)=>{
   const ceiling=Math.min(task.deadline,Date.now()+15000);let previous;
   for(;;){
   await owned();const rows=await page.evaluate(({mapping,count})=>{
    const visible=e=>e.checkVisibility({checkVisibilityCSS:true});
    if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message,[role="dialog"],.x-window,.bg-dialog')].some(visible))return null;
    const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(mapping+';grdTargetColumns')+']')],g=es.length===1&&Ext.getCmp(es[0].id),s=g?.getStore?.(),rs=s?.getData?.()?.items;
    if(g?.el?.dom!==es[0]||s?.isLoading?.()||!Array.isArray(rs)||s.getCount()!==rs.length||rs.length!==count||rs.length>128)return null;
    return rs.map((r,index)=>({record_id:String(r.internalId),index,name:r.data.Name,label:r.data.DisplayName,type:({1:'boolean',2:'datetime',3:'real',4:'integer',5:'string'})[r.data.DataType]}));
   },{mapping,count:fields.length});
   if(rows&&ready(rows)){const key=JSON.stringify(rows);if(key===previous)return rows;previous=key;}else previous=undefined;
   need(Date.now()<ceiling,'complete output mapping did not settle');await page.waitForTimeout(Math.min(100,remaining()));
   }
  };
  let mapped=await readMapping();need(same(mapped.map(({name,type})=>({name,type})),fields.map(({name,type})=>({name,type}))),'output names/types/order changed');
  for(const field of fields){
   const current=mapped.find(m=>m.name===field.name);if(current.label===field.label)continue;
   await click(mapping+';colDisplayName_'+field.name,{grid:mapping+';grdTargetColumns',row:current.record_id},true);
   await at('EditVariableForm').waitFor({state:'visible',timeout:remaining()});
   await fill('EditVariableForm;edtDisplayName',field.label,{dialog:'EditVariableForm'});
   await click('EditVariableForm;btnApply',{dialog:'EditVariableForm'});mapped=await readMapping(rows=>rows.find(m=>m.name===field.name)?.label===field.label);
   need(mapped.find(m=>m.name===field.name)?.label===field.label,'output label readback differs');
  }
  need(same(mapped.map(({name,label,type})=>({name,label,type})),configuration.input_fields),'output mapping differs');
  configuration.output_mapping=mapped.map(({name,label,type,index})=>({name,label,type,index}));
  await click(root+';btnNext');await at(root+';DoneWizard').waitFor({state:'visible',timeout:remaining()});
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,node_context:await owned(),configuration,
   syntax_validation:{status:'accepted_by_loginom_next',node_context:owner}};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:!effect,node_context:owner,error:'['+phase+' / '+lastAction+'] '+error.message};}
}
