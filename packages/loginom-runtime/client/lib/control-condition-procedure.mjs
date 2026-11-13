import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeConditionConfigureCode(binding,options){
 validatePreparedNodeContext(binding);
 return `async page=>(${configureCondition.toString()})(page,${JSON.stringify({...options,binding})},${readPreparedNodeContext.toString()},${readConditionWizard.toString()})`;
}

// Read only materialized Ext records of the open Condition wizard. Native
// field/value objects are compared by identity and never traversed.
export function readConditionWizard(prefix){
 const fail=reason=>({verified:false,reason}),root=prefix+';WizrdMCF',sockets=root+';ConditionSocketsWizard',params=root+';ConditionParamsWizard';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const shown=e=>!!e&&e.checkVisibility({checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0;
 const roots=exact(root);if(roots.length!==1||!shown(roots[0]))return fail('condition_wizard_root');
 const cmp=t=>{const es=exact(t);if(es.length!==1||!roots[0].contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const records=(c,max)=>{const s=c?.getStore?.(),rs=s?.getData?.()?.items;
  return s?.$className==='Ext.data.Store'&&!s.isLoading?.()&&Array.isArray(rs)&&rs.length<=max&&s.getCount()===rs.length?rs:null;};
 const page=shown(exact(sockets+';grdSockets;tbl')[0])?'ports':shown(exact(params+';grdBranches;tbl')[0])?'branches'
  :shown(exact(root+';DoneWizard;edtDisplayName')[0])?'done':null;
 if(!page)return fail('condition_wizard_page');
 const errorButton=exact(root+';btnError')[0],error=shown(errorButton)?errorButton.getAttribute('data-qtip')??'':null;
 const result={verified:true,page,error};
 const portRows=records(cmp(sockets+';grdSockets'),32);
 if(page==='ports'){
  if(!portRows)return fail('condition_port_inventory');
  const kinds={'Таблица':'table','Переменные':'variables','Дерево данных':'tree'};
  result.ports=[];
  for(const [i,r] of portRows.entries()){
   const d=r?.data,cell=exact(sockets+';colSocketType_'+i),kind=cell.length===1?kinds[cell[0].textContent.trim()]:undefined;
   if(!r?.isModel||d?.Index!==i||typeof d.Name!=='string'||typeof d.DisplayName!=='string'||typeof d.PassToOutput!=='boolean'||!kind)return fail('condition_port_record');
   result.ports.push({index:i,record_id:String(r.internalId),kind,name:d.Name,label:d.DisplayName,pass_to_output:d.PassToOutput});
  }
 }
 if(page==='branches'){
  const grid=cmp(params+';grdBranches'),rows=records(grid,32);if(!rows)return fail('condition_branch_inventory');
  result.branches=[];
  for(const [i,r] of rows.entries()){const d=r?.data;
   if(!r?.isModel||d?.Index!==i||typeof d.DisplayName!=='string'||typeof d.ActiveInDebug!=='boolean')return fail('condition_branch_record');
   result.branches.push({index:i,record_id:String(r.internalId),name:d.DisplayName,active_in_debug:d.ActiveInDebug});}
  const selected=grid.getSelectionModel?.().getSelection?.();
  if(!Array.isArray(selected)||selected.length>1||selected.some(r=>!rows.includes(r)))return fail('condition_branch_selection');
  result.selected_branch=selected.length?rows.indexOf(selected[0]):null;
  const debug=exact(params+';pedDebugMode;ValueControl')[0];
  if(!debug)return fail('condition_debug_control');
  result.debug_mode=debug.classList.contains('x-form-cb-checked');
  const view=cmp(params+';ConditionsView'),conditions=records(view,64);if(!conditions)return fail('condition_inventory');
  const editor=cmp(params+';ConditionsView;tbl;celleditor;cbx'),fields=editor?records(editor,1000):null;
  const relations={6:'='};
  result.conditions=[];
  for(const [i,r] of conditions.entries()){const d=r?.data;
   if(!r?.isModel||d?.Index!==i)return fail('condition_record');
   const field=fields?.filter(f=>f.data.Value===d.Value)??[];
   const v=d.CompareValue;
   result.conditions.push({index:i,record_id:String(r.internalId),
    field:field.length===1?{name:field[0].data.Name,variable:field[0].data.IsVariableField===true,socket_guid:field[0].data.SocketGuid,data_type:field[0].data.DataType}:null,
    data_type:d.DataType,aggregation:d.AggregationType,relation:relations[d.RelationType]??('native:'+d.RelationType),
    value:v===null||typeof v==='string'||Number.isSafeInteger(v)?v:'unsupported',or:d.ConcatenationType!==0,case_sensitive:d.CaseSensitive===true});}
  result.field_options=fields?fields.map(f=>({record_id:String(f.internalId),name:f.data.Name,variable:f.data.IsVariableField===true,socket_guid:f.data.SocketGuid,data_type:f.data.DataType})):null;
 }
 return result;
}

// Private UI procedure for the stage-one Condition. Each gesture is guarded by
// the prepared node owner and the original deadline; unknown effects are not retried.
export async function configureCondition(page,task,readNode=readPreparedNodeContext,readWizard=readConditionWizard){
 let effect=false,phase='inventory';
 const need=(ok,message)=>{if(!ok)throw Error('Condition '+message);};
 const b=task.binding,prefix=b.workflow_ref.prefix,root=prefix+';WizrdMCF',sockets=root+';ConditionSocketsWizard;',params=root+';ConditionParamsWizard;',cv=params+'ConditionsView;';
 const remaining=()=>{const n=task.deadline-Date.now();need(n>0,'original deadline expired');return n;};
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 let owner;
 const owned=async()=>{remaining();const c=await readNode(page,b);need(c.verified===true&&c.surface==='wizard'&&!c.input_port&&!c.output_port,'owned wizard required');
  need(!owner||JSON.stringify(owner)===JSON.stringify(c),'owner changed');owner??=c;return c;};
 const state=async(ready=()=>true,what='state')=>{
  const ceiling=Math.min(task.deadline,Date.now()+15000);let last;
  // Native stores load after the page is shown: accept two equal reads in a row.
  let previous;
  for(;;){await owned();last=await page.evaluate(readWizard,prefix);
   if(last.verified===true&&ready(last)){const key=JSON.stringify(last);if(key===previous)return last;previous=key;}else previous=undefined;
   need(Date.now()<ceiling,what+' did not settle: '+(last.reason??last.page));await page.waitForTimeout(Math.min(150,remaining()));}
 };
 const click=async(tid,options={})=>{await owned();await at(tid).click({timeout:Math.min(15000,remaining()),...options});effect=true;};
 // Native cell editors are created lazily and numbered by creation order.
 const focused=async owner=>{const ceiling=Math.min(task.deadline,Date.now()+15000);
  for(;;){if(await page.evaluate(o=>{const a=document.activeElement,t=a?.closest('[data-tid]')?.getAttribute('data-tid')??'';
    return a?.tagName==='INPUT'&&(t===o||t.startsWith(o+';')||t.startsWith(o+'-'))&&a.checkVisibility();},owner))return;
   need(Date.now()<ceiling,'cell editor did not open');await page.waitForTimeout(Math.min(100,remaining()));}};
 const typeValue=async text=>{await page.keyboard.press('Control+A');await page.keyboard.type(text);await page.keyboard.press('Enter');effect=true;};
 const next=async(expected)=>{await click(root+';btnNext');
  const s=await state(s=>s.page===expected||s.error!==null,'page '+expected);
  need(s.error===null,'Loginom refused the page: '+s.error);return s;};
 try{
  let s=await state(s=>s.page==='ports','ports page');
  phase='ports';
  if(task.mode==='ports'){
   need(s.ports.length===0,'new node already has ports');
   for(const [kind,label] of [['table','Таблица'],['variables','Переменные']]){
    // Opening the native Add menu has no data effect; it may ignore a click
    // right after the previous item closed it, so reopen a bounded number of times.
    const items=page.locator('[data-tid^='+JSON.stringify(sockets+'btnAdd;mn;mn.i')+']:visible',{hasText:label});
    for(let attempt=0;;attempt++){
     if(!await items.count())await click(sockets+'btnAdd');
     try{await items.first().waitFor({state:'visible',timeout:Math.min(3000,remaining())});break;}
     catch{need(attempt<3,'add menu did not open');}
    }
    need(await items.count()===1,'unique add menu item '+label);
    await owned();await items.first().click({timeout:Math.min(15000,remaining())});
    const count=s.ports.length+1;s=await state(x=>x.page==='ports'&&x.ports.length===count,'added '+kind+' port');
    need(s.ports.at(-1).kind===kind,'added port kind differs');
   }
   for(const port of s.ports)if(!port.pass_to_output){await click(sockets+'colPassToOutput_'+port.index);s=await state(x=>x.ports[port.index]?.pass_to_output===true,'pass to output');}
  }
  need(s.ports.length===2&&s.ports[0].kind==='table'&&s.ports[1].kind==='variables'&&s.ports.every(p=>p.pass_to_output),
   'requires exactly table input 0 and variables input, both passed to output; other port layouts are not supported');
  const ports=s.ports.map(({index,kind,name,label,pass_to_output})=>({index,kind,name,label,pass_to_output}));
  s=await next('branches');phase='branches';
  s=await state(x=>x.page==='branches'&&x.branches.length>0,'branch inventory');
  need(s.branches.length===1,'supports one user branch; found '+s.branches.length);
  need(s.debug_mode===false,'debug mode is not supported');
  if(s.selected_branch!==0){await click(params+'colBranch_'+s.branches[0].name);s=await state(x=>x.selected_branch===0,'branch selection');}
  if(task.mode==='variable_branch'&&!task.parameters.branches){
   // parameters {}: keep the saved branch, read it back and execute again.
   phase='saved_condition';
   s=await state(x=>x.conditions.length>0,'saved condition');
   need(s.conditions.length===1,'supports one condition row; found '+s.conditions.length);
   // Read-only check: a table field has DataType 0 and a row-count aggregation (1).
   const c=s.conditions[0];
   need((c.field?c.field.variable===true:c.data_type!==0&&c.aggregation!==1)&&c.relation==='='&&c.value!==null&&!c.or&&!c.case_sensitive,
    'saved Condition is not one variable = value branch; reconfigure it with branches');
  }else if(task.mode==='variable_branch'){
   const want=task.parameters.branches[0];
   if(s.branches[0].name!==want.name){
    await at(params+'colBranch_'+s.branches[0].name).dblclick({timeout:Math.min(15000,remaining())});effect=true;
    await focused(params+'grdBranches;tbl;celleditor');
    await typeValue(want.name);s=await state(x=>x.branches[0]?.name===want.name,'branch name');
    if(s.selected_branch!==0){await click(params+'colBranch_'+want.name);s=await state(x=>x.selected_branch===0,'branch selection');}
   }
   phase='condition';
   if(s.conditions.length===0){await click(cv+'btnAdd');s=await state(x=>x.conditions.length===1,'condition row');}
   need(s.conditions.length===1,'supports one condition row; found '+s.conditions.length);
   await click(cv+'colField_0');await click(cv+'tbl;celleditor;cbx;trg_picker');
   s=await state(x=>Array.isArray(x.field_options),'field list');
   const options=s.field_options.filter(f=>f.variable&&f.name===want.variable);
   need(options.length===1,'variable '+JSON.stringify(want.variable)+' is not an input variable; link variables to input 0 and use its exact name. Available: '
    +JSON.stringify(s.field_options.filter(f=>f.variable).map(f=>f.name)));
   const item=page.locator('[data-tid^='+JSON.stringify(cv+'tbl;celleditor;cbx;boundlist;')+'][data-recordid='+JSON.stringify(options[0].record_id)+']:visible');
   need(await item.count()===1,'unique variable list item');await owned();await item.click({timeout:Math.min(15000,remaining())});
   await page.keyboard.press('Enter');
   s=await state(x=>x.conditions[0]?.field?.name===want.variable&&x.conditions[0].field.variable,'selected variable');
   need(s.conditions[0].aggregation!==1&&s.conditions[0].relation==='=','variable condition must have no aggregation and relation =');
   await click(cv+'colCompareValue_0');await focused(cv+'tbl;celleditor');
   await typeValue(String(want.value));
   s=await state(x=>x.conditions[0]?.value===want.value,'compare value').catch(async()=>page.evaluate(readWizard,prefix));
   need(s.conditions?.[0]?.value===want.value,'Loginom stored value '+JSON.stringify(s.conditions[0].value)+' instead of '+JSON.stringify(want.value)+'; use a value of the variable type');
   need(!s.conditions[0].or&&!s.conditions[0].case_sensitive,'OR and case-sensitive conditions are not supported');
  }
  const branches=s.branches.map(({index,name})=>({index,name}));
  const conditions=task.mode==='variable_branch'?s.conditions.map(({index,field,relation,value})=>({index,variable:field?.name??null,relation,value})):null;
  phase='finish_page';s=await next('done');
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,node_context:await owned(),
   configuration:{verified:true,mode:task.mode,ports,branches,conditions,debug_mode:false,node_context:owner},
   validation:{status:'accepted_by_loginom_next',node_context:owner}};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:!effect,node_context:owner,error:'['+phase+'] '+error.message};}
}
