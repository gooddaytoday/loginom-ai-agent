import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {PYTHON_DECLARED_TYPES} from './python-parameters.mjs';

// One owned step on the Python columns page: Add → EditColumnDefForm (name,
// label, explicit type from the native picker) → Apply, with grid readback per
// column. Set into a differently typed field silently coerces values, so the
// type is selected and read back before Apply; any mismatch refuses.
export function makePythonColumnsCode(binding,options){
 validatePreparedNodeContext(binding);
 const columns=options.columns.map(c=>({name:c.name,label:c.label||c.name,type:c.type,code:PYTHON_DECLARED_TYPES[c.type]}));
 if(!columns.length||columns.some(c=>!c.code))throw Error('Python declared columns require supported types');
 return `async page=>(${configurePythonColumnsPage.toString()})(page,${JSON.stringify({binding,columns,operation_id:options.operation_id,deadline:options.deadline})},${readPreparedNodeContext.toString()})`;
}

export async function configurePythonColumnsPage(page,task,readNode){
 const b=task.binding,root=b.workflow_ref.prefix+';WizrdMCF',base=root+';PythonColumnsWizard';
 const remaining=()=>{const left=task.deadline-Date.now();if(left<=0)throw Error('Python columns deadline expired');return left;};
 let effect=false,formTid=null;
 const inspect=(mode,extra={})=>page.evaluate(({root,base,mode,extra})=>{
  const shown=e=>e?.checkVisibility?.({checkVisibilityCSS:true})===true;
  const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')].filter(shown);
  const point=e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
   if(!hit||!(hit===e||e.contains(hit)))throw Error('Python column control covered by '+(hit?.closest?.('[data-tid]')?.getAttribute('data-tid')||String(hit?.className||hit?.tagName||'nothing')).slice(0,160));return {x,y};};
  if(mode==='inventory'){
   const grids=exact(base+';grdTargetColumns;tbl'),grid=grids.length===1&&globalThis.Ext?.getCmp?.(grids[0].id),store=grid?.getStore?.(),records=store?.getData?.()?.items;
   if(grid?.el?.dom!==grids[0]||!Array.isArray(records)||store.isLoading?.())throw Error('Python columns grid unavailable');
   const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'};
   return {form_open:exact(root+';EditColumnDefForm').length+exact('EditColumnDefForm').length>0,
    columns:records.map(r=>({name:r.data.Name,label:typeof r.data.DisplayName==='string'&&r.data.DisplayName?r.data.DisplayName:r.data.Name,type:types[r.data.DataType]??null}))};
  }
  if(mode==='button'){const es=exact(base+';'+extra.name);if(es.length!==1)throw Error('Unique Python columns button required: '+extra.name);return point(es[0]);}
  const forms=[...exact(root+';EditColumnDefForm'),...exact('EditColumnDefForm')];
  if(forms.length!==1)throw Error('Unique Python column editor required');
  const form=forms[0].getAttribute('data-tid');
  const cmp=name=>{const es=exact(form+';'+name),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
  if(mode==='dialog'){
   const name=cmp('edtName'),label=cmp('edtDisplayName'),type=cmp('cbxDataType');
   if(!name||!label||!type)throw Error('Python column editor fields unavailable');
   return {form,name:name.getValue(),label:label.getValue(),type:type.getValue(),kind:cmp('cbxDataKind')?.getRawValue?.()??null};
  }
  if(mode==='type'){
   const combo=cmp('cbxDataType'),picker=combo?.picker,items=combo?.getStore?.()?.getData?.()?.items??[];
   const matches=items.filter(r=>r.data.Value===extra.value&&(r.data.DisplayText===undefined||r.data.DisplayText===extra.label));
   if(!picker?.el?.dom||!shown(picker.el.dom)||!items.length)throw Error('Python column type option unavailable: '+extra.label);
   if(matches.length!==1)throw Error('Python column type option missing: '+extra.label);
   const node=picker.getNode(matches[0]);if(!node||picker.getRecord(node)!==matches[0])throw Error('Python column type option unbound');
   return point(node);
  }
  throw Error('Unknown Python columns inspection');
 },{root,base,mode,extra});
 // Transient states (editor closing, mask/animation over a control, picker not
 // shown yet) are polled; a bounded wait rethrows the last observed refusal.
 const settle=async(check,limit=Infinity)=>{const until=Date.now()+limit;for(;;){try{const value=await check();if(value)return value;}catch(error){if(!/covered|unavailable|Unique Python column editor/.test(error.message))throw error;if(Date.now()>=until)throw error;}await page.waitForTimeout(Math.min(100,remaining()));}};
 const labels={1:'Логический',2:'Дата/Время',3:'Вещественный',4:'Целый',5:'Строковый'};
 try{
  const node=await readNode(page,b);
  if(!node.verified||node.surface!=='wizard')throw Error('Python columns page owner unavailable');
  let inventory=await inspect('inventory');
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),wanted=task.columns.map(({name,label,type})=>({name,label,type}));
  if(!same(inventory.columns.map(c=>c.name),wanted.map(c=>c.name))&&inventory.columns.length)
   throw Error('Existing declared columns differ; only an empty columns page or the same names are supported: '+inventory.columns.map(c=>c.name).join(','));
  for(const [index,column] of task.columns.entries()){
   if(inventory.columns[index]&&same(inventory.columns[index],wanted[index]))continue;
   if(inventory.columns[index])throw Error('Existing declared column '+column.name+' differs in type or label');
   const add=await settle(()=>inspect('button',{name:'btnAddMappingColumn'}),10000);effect=true;await page.mouse.click(add.x,add.y);
   let dialog=await settle(()=>inspect('dialog'));formTid=dialog.form;
   const fill=async(key,value)=>{const input=page.locator('[data-tid='+JSON.stringify(formTid+';'+key)+'] input:visible');if(await input.count()!==1)throw Error('Unique Python column field required: '+key);
    await input.fill(value,{timeout:remaining()});await input.press('Tab',{timeout:remaining()});};
   await fill('edtName',column.name);await fill('edtDisplayName',column.label);
   dialog=await inspect('dialog');
   if(dialog.type!==column.code){
    await page.locator('[data-tid='+JSON.stringify(formTid+';cbxDataType;trg_picker')+']:visible').click({timeout:remaining()});
    const option=await settle(()=>inspect('type',{value:column.code,label:labels[column.code]}));await page.mouse.click(option.x,option.y);
    dialog=await settle(async()=>{const d=await inspect('dialog');return d.type===column.code?d:null;});
   }
   if(dialog.name!==column.name||dialog.label!==column.label||dialog.type!==column.code)throw Error('Python column editor readback differs for '+column.name);
   await page.locator('[data-tid='+JSON.stringify(formTid+';btnApply')+']:visible').click({timeout:remaining()});
   inventory=await settle(async()=>{const i=await inspect('inventory');return !i.form_open&&i.columns.length===index+1?i:null;});formTid=null;
   if(!same(inventory.columns[index],wanted[index]))throw Error('Python column grid readback differs for '+column.name+': '+JSON.stringify(inventory.columns[index]));
  }
  inventory=await inspect('inventory');
  if(!same(inventory.columns,wanted))throw Error('Python declared columns readback differs');
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,node_context:await readNode(page,b),columns:inventory.columns};
 }catch(error){
  let cleanup=!formTid;
  if(formTid)try{await page.locator('[data-tid='+JSON.stringify(formTid+';btnCancel')+']:visible').click({timeout:Math.min(5000,Math.max(1,task.deadline-Date.now()))});
   await page.locator('[data-tid='+JSON.stringify(formTid)+']').waitFor({state:'hidden',timeout:5000});cleanup=true;}catch{}
  return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:cleanup,error:String(error?.message??error).slice(0,400)};
 }
}
