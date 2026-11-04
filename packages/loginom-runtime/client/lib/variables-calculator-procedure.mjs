import {validatePreparedNodeContext,readPreparedNodeContext} from './node-context.mjs';
import {readVariablesCalculatorContext,readVariablesCalculatorBrowser} from './variables-calculator-context.mjs';

export function makeVariablesCalculatorConfigureCode(binding,options) {
 validatePreparedNodeContext(binding);
 return `async page=>(${configureVariablesCalculator.toString()})(page,${JSON.stringify({...options,binding})},${readPreparedNodeContext.toString()},${readVariablesCalculatorContext.toString()},${readVariablesCalculatorBrowser.toString()})`;
}

// The host resolves every patch against a complete native inventory first.
// This private browser step rechecks that exact baseline before any gesture;
// every write uses rendered UI and reads the native configuration back.
export async function configureVariablesCalculator(page,task,readNode=readPreparedNodeContext,readContext=readVariablesCalculatorContext,readBrowser=readVariablesCalculatorBrowser) {
 let effect=false,phase='preflight';
 const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const semantic=e=>Object.fromEntries(['name','label','type','formula','description','intermediate'].map(k=>[k,e[k]]));
 const remaining=()=>{const n=task.deadline-Date.now();requireValue(n>0,'original deadline expired');return n;};
 const b=task.binding,root=b.workflow_ref.prefix+';WizrdMCF',base=root+';CalcVariablesWizard',editor=root+';ExprEditForm';
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 let owner;
 const owned=async()=>{
  remaining();const context=await readNode(page,b);
  requireValue(context.verified===true&&context.surface==='wizard'&&!context.input_port&&!context.output_port,'owned calculator wizard required');
  requireValue(!owner||same(owner,context),'calculator owner changed');owner??=context;return context;
 };
 const inventory=async()=>{
  for(;;){
  await owned();const value=await readContext(page,b,readNode,readBrowser);
  if(value.verified!==true&&value.reason==='variables_calculator_mask'&&same(value.node_context,owner)){await page.waitForTimeout(Math.min(100,remaining()));continue;}
  requireValue(value.verified===true&&value.inventory_complete===true&&same(value.node_context,owner),'complete same-owner calculator inventory required');return value;
  }
 };
 const inspect=async(mode,extra={})=>{
  for(;;){
  await owned();const value=await page.evaluate(({root,base,editor,origin,build,mode,extra})=>{
   const need=(ok,message)=>{if(!ok)throw Error('Variables calculator '+message);};
   const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
   const visible=e=>e.checkVisibility({checkVisibilityCSS:true});
   const cmp=tid=>{const es=exact(tid);need(es.length===1,'unique control '+tid);const c=globalThis.Ext?.getCmp(es[0].id);need(c?.el?.dom===es[0],'native control '+tid);return c;};
   need(location.origin===origin&&globalThis.bg?.app?.Version===build,'origin/build');
   const roots=exact(base);need(roots.length===1&&visible(roots[0]),'wizard root');
   const dialogs=[...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog')].filter(visible),editors=exact(editor);
   const masks=[...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].filter(visible);
   const ownedEditor=editors.length===1&&visible(editors[0])&&dialogs.length===1&&dialogs[0]===editors[0];
   // Match workspace-ui's modal_background ownership rule. Loginom can
   // attach the own editor's backdrop outside the wizard and use bg-mask-message.
   const modalBackground=ownedEditor&&masks.every(m=>!m.contains(editors[0])&&!editors[0].contains(m));
   if(masks.length&&!modalBackground){
    need(dialogs.length===0||ownedEditor,'unmasked wizard '+JSON.stringify({mode,masks:masks.map(m=>({tid:m.getAttribute('data-tid'),classes:String(m.className)})),dialogs:dialogs.map(d=>d.getAttribute('data-tid'))}));
    return {pending_mask:true};
   }
   const point=e=>{const box=e.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,hit=document.elementFromPoint(x,y);
    need(visible(e)&&box.width>0&&box.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&(hit===e||e.contains(hit)),'rendered hit');return {x,y};};
   if(mode==='button'||mode==='row'||mode==='formula'||mode==='focus') {
    need(dialogs.length===0,'no foreign dialog');
    if(mode==='button'){const c=cmp(base+';'+extra.key);need(roots[0].contains(c.el.dom)&&!c.disabled,'enabled wizard button');return point(c.el.dom);}
    const grid=cmp(base+';grdExpressions'),records=grid.getStore().getData().items;
    const matches=records.filter(r=>String(r.internalId)===extra.record_id&&r.data.Name===extra.name);
    need(matches.length===1,'retained expression');
    if(mode==='row'){const row=grid.getView().getNode(matches[0]);need(row&&grid.getView().getRecord(row)===matches[0],'retained rendered row');return point(row);}
    const selected=grid.getSelectionModel().getSelection();need(selected.length===1&&selected[0]===matches[0],'selected formula owner');
    const es=exact(base+';cmpExpression'),wrappers=es.length===1?[...es[0].querySelectorAll('.CodeMirror')]:[];
    need(wrappers.length===1&&wrappers[0].CodeMirror?.getWrapperElement()===wrappers[0]&&roots[0].contains(es[0]),'owned CodeMirror');
    if(mode==='focus'){const cm=wrappers[0].CodeMirror,input=cm.getInputField?.(),doc=cm.getDoc?.();
     need(input&&document.activeElement===input&&wrappers[0].contains(input),'focused CodeMirror input');
     if(extra.text!==undefined)need(doc&&Array.from({length:doc.lineCount()},(_,i)=>doc.getLine(i)).join('\n')===extra.text,'focused document text');return true;}
    return point(wrappers[0]);
   }
   need(ownedEditor,'one owned expression editor');
   const fields={name:'edtName',label:'edtDisplayName',description:'txtDescription',type:'cbxDataType'};
   if(mode==='field'){const c=cmp(editor+';'+fields[extra.key]),inputs=[...c.el.dom.querySelectorAll('input,textarea')].filter(visible);need(!c.disabled&&inputs.length===1,'enabled editor input');return point(inputs[0]);}
   if(mode==='dialog')return Object.fromEntries(Object.entries(fields).map(([key,tid])=>[key,cmp(editor+';'+tid).getValue()]));
   if(mode==='type') {
    const c=cmp(editor+';cbxDataType'),picker=c.picker,records=c.getStore().getData().items;
    const matches=records.filter(r=>r.data.Value===extra.value&&r.data.DisplayText===extra.label);
    need(matches.length===1&&picker?.el.dom&&visible(picker.el.dom),'exact native type picker');
    const item=picker.getNode(matches[0]);need(item&&picker.getRecord(item)===matches[0],'exact type option');return point(item);
   }
   if(mode==='apply'){const c=cmp(editor+';btnApply');need(editors[0].contains(c.el.dom)&&!c.disabled,'owned Apply');return point(c.el.dom);}
   need(false,'unsupported inspection');
  },{root,base,editor,origin:task.origin,build:task.build,mode,extra});
  if(value?.pending_mask!==true)return value;
  await page.waitForTimeout(Math.min(100,remaining()));
  }
 };
 const click=async(mode,extra)=>{const point=await inspect(mode,extra);effect=true;await page.mouse.click(point.x,point.y);};
 try {
  const before=await inventory(),plan=task.plan;
  requireValue(plan&&Array.isArray(plan.baseline)&&Array.isArray(plan.changes)&&Array.isArray(plan.expressions),'resolved patch required');
  requireValue(same(before.expressions,plan.baseline),'calculator changed since patch planning');
  let current=before;
  for(const change of plan.changes) {
   remaining();phase='expression_'+change.after.name;
   const patch=change.after,prior=change.before;
   if(prior) {
    const matches=current.expressions.filter(e=>e.record_id===prior.record_id);
    requireValue(matches.length===1&&same(semantic(matches[0]),semantic(prior)),'retained expression changed');
    if(same(semantic(prior),semantic(patch)))continue;
    // Playwright scrolls only this exact retained expression row; native grid
    // identity and live hit testing are checked again before selection.
    await at(base+';colExpressionName_'+prior.name).scrollIntoViewIfNeeded({timeout:remaining()});
    await click('row',{record_id:prior.record_id,name:prior.name});
    current=await inventory();requireValue(current.expressions.find(e=>e.record_id===prior.record_id)?.selected===true,'selection did not settle');
   }
   const propertiesChanged=!prior||['name','label','type','description'].some(k=>patch[k]!==prior[k]);
   if(propertiesChanged) {
    await click('button',{key:prior?'btnExprEdit':'btnAddExpr'});
    await at(editor).waitFor({state:'visible',timeout:remaining()});
    const initial=await inspect('dialog');
    if(prior)requireValue(initial.name===prior.name&&initial.label===prior.label&&initial.type===({boolean:1,real:3,integer:4,string:5})[prior.type]&&initial.description===prior.description,'editor does not match retained expression');
    for(const [key,tid] of [['name','edtName'],['label','edtDisplayName'],['description','txtDescription']]) {
     const state=await inspect('dialog');if(state[key]===patch[key])continue;
     await inspect('field',{key});const input=at(editor+';'+tid).locator('input:visible,textarea:visible');requireValue(await input.count()===1,'unique owned editor input');
     effect=true;await input.fill(patch[key],{timeout:remaining()});await input.press('Tab',{timeout:remaining()});
    }
    const type=({boolean:1,real:3,integer:4,string:5})[patch.type],label=({boolean:'Логический',real:'Вещественный',integer:'Целый',string:'Строковый'})[patch.type];
    if((await inspect('dialog')).type!==type) {
     effect=true;await at(editor+';cbxDataType;trg_picker').click({timeout:remaining()});await click('type',{value:type,label});
    }
    const fields=await inspect('dialog');requireValue(fields.name===patch.name&&fields.label===patch.label&&fields.description===patch.description&&fields.type===type,'editor values differ');
    await click('apply');await page.locator('[data-tid='+JSON.stringify(editor)+']').waitFor({state:'hidden',timeout:remaining()});
    current=await inventory();
   }
   const matches=current.expressions.filter(e=>e.name===patch.name);
   requireValue(matches.length===1&&(!prior||matches[0].record_id===prior.record_id),'applied expression identity differs');
   const row=matches[0];
   if(!prior)requireValue(current.expressions.length===before.expressions.length+plan.changes.filter(c=>!c.before&&current.expressions.some(e=>e.name===c.after.name)).length,'new expression count differs');
   requireValue(row.selected===true,'edited expression must remain selected');
   if(row.formula!==patch.formula) {
    const point=await inspect('formula',{record_id:row.record_id,name:row.name});effect=true;
    await page.mouse.click(point.x,point.y);
    await inspect('focus',{record_id:row.record_id,name:row.name,text:row.formula});await page.keyboard.press('ControlOrMeta+A');
    await inspect('focus',{record_id:row.record_id,name:row.name,text:row.formula});await page.keyboard.press('Backspace');
    await inspect('focus',{record_id:row.record_id,name:row.name,text:''});await page.keyboard.insertText(patch.formula);
   }
   current=await inventory();requireValue(same(semantic(current.expressions.find(e=>e.record_id===row.record_id)),semantic(patch)),'native expression readback differs');
  }
  const final=await inventory();
  requireValue(same(final.expressions.map(semantic),plan.expressions.map(semantic)),'complete calculator differs from resolved patch');
  requireValue(plan.baseline.every(e=>final.expressions.some(f=>f.record_id===e.record_id&&f.expression_id===e.expression_id)),'retained expression identity lost');
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:true,settings_applied:false,before,configuration:final,node_context:owner};
 } catch(error) {
  return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:!effect,error:(phase+': '+String(error.message)).slice(0,500)};
 }
}

export async function advanceVariablesCalculatorConfiguration(channel,changed) {
 const need=(ok,message)=>{if(!ok)throw Error('Variables calculator: '+message);};
 const owner=changed.configuration?.node_context;
 need(changed.verified===true&&owner?.verified===true,'verified configuration owner required');
 const sameOwner=s=>s.prepared_node_context?.verified===true&&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===owner[k]);
 const before=await channel.observe({condition:'variables calculator before native syntax validation',readVariablesCalculator:true,
  ready:s=>sameOwner(s)&&s.wizard?.stage==='variables_calculator'&&s.node_variables_calculator?.verified===true});
 need(JSON.stringify(before.node_variables_calculator.expressions)===JSON.stringify(changed.configuration.expressions),'configuration changed before Next');
 await channel.perform({condition:'validate variables calculator expressions and advance',initialObservation:before,
  ready:s=>sameOwner(s)&&s.wizard?.stage==='variables_calculator',identity:()=>owner,
  resolve:s=>{const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
   need(controls.length===1,'unique Next required; inspect native formula error');return {verb:'wizard_step',ref:controls[0].ref,expected_stage:'done'};}});
 const done=await channel.observe({condition:'variables calculator syntax accepted by native Next',
  ready:s=>sameOwner(s)&&s.wizard?.stage==='done'});
 return {...changed,syntax_validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
