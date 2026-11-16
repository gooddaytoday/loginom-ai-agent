import {validatePreparedNodeContext,readPreparedNodeContext} from './node-context.mjs';
import {openPreparedOutputPort} from './node-port-open.mjs';
import {readSupernodeContext,readSupernodeBrowser,readSupernodeVariablesBrowser} from './supernode-context.mjs';

export function makeSupernodeConfigureCode(binding,options){
 validatePreparedNodeContext(binding);
 if(Object.hasOwn(options.parameters,'definitions'))return `async page=>(${configureSupernodeVariablesBrowser.toString()})(page,${JSON.stringify({...options,binding})},${readPreparedNodeContext.toString()},${openPreparedOutputPort.toString()},${readSupernodeVariablesBrowser.toString()})`;
 return `async page=>(${configureSupernodeBrowser.toString()})(page,${JSON.stringify({...options,binding})},${readPreparedNodeContext.toString()},${readSupernodeContext.toString()},${readSupernodeBrowser.toString()})`;
}
export async function configureSupernodeBrowser(page,task,readNode=readPreparedNodeContext,readContext=readSupernodeContext,readBrowser=readSupernodeBrowser){
 let effect=false,owner;
 const need=(v,m)=>{if(!v)throw Error('Supernode: '+m);};
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const remaining=()=>{const n=task.deadline-Date.now();need(n>0,'original deadline expired');return n;};
 const b=task.binding,base=b.workflow_ref.prefix+';WizrdMCF;GenericModelComponentWizard',grid=base+';grdModelPorts',editor=grid+';roweditor';
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 const owned=async()=>{
  remaining();const c=await readNode(page,b);
  need(c.verified===true&&c.surface==='wizard'&&!c.input_port&&!c.output_port&&(!owner||same(c,owner)),'wizard owner changed');owner??=c;
  const guards=await page.evaluate(({origin,build,base})=>{
   const visible=e=>e.checkVisibility({checkVisibilityCSS:true});
   const roots=[...document.querySelectorAll('[data-tid='+JSON.stringify(base)+']')];
   return location.origin===origin&&globalThis.bg?.app?.Version===build&&roots.length===1&&visible(roots[0])
    &&![...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog,.x-mask,.x-mask-msg,.bg-mask-message')].some(visible);
  },{origin:task.origin,build:task.build,base});
  need(guards,'origin/build, root, mask or dialog changed');
 };
 const inventory=async()=>{
  await owned();const c=await readContext(page,b,readNode,readBrowser);
  need(c.verified===true&&c.inventory_complete===true,'complete boundary inventory required: '+c.reason);return c;
 };
 const click=async(tid,{double=false}={})=>{
  await owned();const locator=at(tid);await locator.waitFor({state:'visible',timeout:remaining()});
  need(await locator.count()===1,'unique rendered control required: '+tid);
  await locator.click({trial:true,timeout:remaining()});await owned();effect=true;
  if(double)await locator.dblclick({timeout:remaining()});else await locator.click({timeout:remaining()});
 };
 try{
  let before=await inventory();
  const boundary=task.parameters.boundary,variable=task.parameters.mode==='variable_boundary',inputKind=variable?'variables':'table';
  if(!boundary){need(before.ports.length===2,'existing 1-to-1 boundary required');}
  else{
   need(before.ports.length===0||before.ports.length===2,'partial or unsupported boundary; no edits');
   const existing=before.ports.length===2;
   if(existing)need(before.ports.every((p,i)=>p.name===boundary[i===0?'input':'output'].name&&p.label===boundary[i===0?'input':'output'].label
    &&p.kind===(i===0?inputKind:'table')&&(i!==0||p.optional===variable)),'existing connected boundary differs; destructive edits are unsupported');
   if(!existing)for(const [index,direction] of ['input','output'].entries()){
    const old=await inventory();need(old.ports.length===index,'unexpected port count before Add');
    await click(grid+';tbl;GroupHeader;'+index+';AddButton');
    const guid=index===0&&variable?'ba746e45-732e-4115-b420-f8f645b94c8d':index===0?'05969d66-64f2-4d9f-b714-a2c9821461db':'d2278de3-ce0b-407b-9839-c05d14a1debe';
    await click(base+';mnAddSocket;'+guid);
    const added=await inventory();
    need(added.ports.length===index+1&&old.ports.every(p=>added.ports.some(x=>x.record_id===p.record_id&&same(x,p))),'Add changed another port');
    const created=added.ports.filter(p=>!old.ports.some(x=>x.record_id===p.record_id));need(created.length===1,'one new port required');
    await click(created[0].name_tid,{double:true});
    for(const [key,suffix] of [['name','colName_cbx'],['label','colDisplayName_txt']]){
     await owned();const input=at(editor+';'+suffix).locator('input:visible');need(await input.count()===1,'owned row editor field required');
     effect=true;await input.fill(boundary[direction][key],{timeout:remaining()});
    }
    await click('roweditorbuttons;update');
    const updated=await inventory(),port=updated.ports.find(p=>p.record_id===created[0].record_id);
    need(port?.name===boundary[direction].name&&port.label===boundary[direction].label&&port.kind===(index===0?inputKind:'table')
     &&(index!==0||port.optional===variable),'port UI readback differs');
   }
  }
  const final=await inventory();
  need(final.ports.length===2&&final.ports[0].kind===inputKind&&final.ports[1].kind==='table'&&final.ports[0].optional===variable,'one supported input and table output required');
  const configuration={verified:true,inventory_complete:true,mode:task.parameters.mode,node_context:owner,
   boundary:Object.fromEntries(final.ports.map((p,i)=>[i===0?'input':'output',{kind:p.kind,name:p.name,label:p.label,record_id:p.record_id,...(i===0&&!variable?{requirement:'required'}:{})}]))};
  return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:effect,node_context:owner,configuration};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,cleanup_complete:!effect,effect_possible:effect,node_context:owner??null,error:String(error.message).slice(0,1500)};}
}

export async function configureSupernode(channel,parameters,{request}){
 const changed=await channel.configureSupernode({...parameters,mode:request.mode});
 if(request.finish==='close')return changed;
 await channel.perform({condition:'accept native Supernode boundary',ready:s=>s.wizard?.stage==='supernode',identity:s=>s.prepared_node_context,
  resolve:s=>{const next=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
   if(next.length!==1)throw Error('Supernode Next unavailable; inspect native btnError');
   return {verb:'wizard_step',ref:next[0].ref,expected_stage:'done'};}});
 const done=await channel.observe({condition:'Supernode boundary accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
 return {...changed,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}

export async function configureSupernodeVariablesBrowser(page,t,readNode,openPort,readVariables){
 const b=t.binding,root=b.workflow_ref.prefix+';WizrdMCF',form=root+';TuneVariablesMappingWizard';
 let effect=false,opened=false;
 const need=(v,m)=>{if(!v)throw Error('Supernode variables: '+m);};
 const remaining=()=>{const n=t.deadline-Date.now();need(n>0,'original deadline expired');return n;};
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 const inspect=()=>page.evaluate(readVariables,t);
 const guard=async(dialog=false)=>{
  remaining();const n=await readNode(page,b);need(n.verified&&n.surface==='wizard'&&n.input_port?.port===0,'owned variable wizard required');
  await inspect();
  need(await page.evaluate(({root,dialog})=>{
   const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')],visible=e=>e.checkVisibility({checkVisibilityCSS:true});
   const roots=exact(root),ds=[...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog')].filter(visible),edit=exact('EditTuneVariableForm').filter(visible);
   const masks=[...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].filter(visible).filter(e=>{
    const parent=e.parentElement,c=parent&&globalThis.Ext?.getCmp(parent.id);
    return !(e.classList.contains('x-mask')&&!e.textContent.trim()&&parent?.getAttribute('data-tid')===root+';TuneVariablesMappingWizard;colTargetDelete'
     &&roots[0]?.contains(parent)&&c?.el.dom===parent&&c.disabled===true);
   });
   return !masks.length&&(dialog?edit.length===1&&ds.length===1&&ds[0]===edit[0]&&Ext.getCmp(edit[0].id)?.$className==='bg.wizards.variables.view.EditVariableForm':!ds.length);
  },{root,dialog}),'foreign dialog or mask');
 };
 const click=async(tid,dialog=false)=>{await guard(dialog);need(await at(tid).count()===1,'unique control required');await at(tid).click({trial:true,timeout:remaining()});await guard(dialog);effect=true;await at(tid).click({timeout:remaining()});};
 try{
  const before=await readNode(page,b);need(before.verified&&before.surface==='graph'&&!before.locked,'owned unlocked graph required');
  const result=await openPort(page,{...t,operation_id:t.operation_id+':port',direction:'input',kind:'variables',port:0},readNode);
  effect=result.effect_possible===true;need(result.status==='SUCCEEDED',result.error);opened=true;
  await guard();let current=await inspect();const wanted=t.parameters.definitions;
  if(current.definitions.length||t.parameters.read_only){
   need(current.definitions.length>0,'saved variable definitions required');
   if(wanted)need(JSON.stringify(current.definitions.map(d=>({name:d.name,type:d.type,value:d.value})))===JSON.stringify(wanted),'saved definitions differ; deletion, replacement and reordering are unsupported');
  }else{
   need(wanted?.length,'complete definitions required for an empty input');
   for(const v of wanted){
    const previous=current;
    await click(form+';btnAddMappingColumn');
    await at('EditTuneVariableForm').waitFor({state:'visible',timeout:remaining()});
    await click('EditTuneVariableForm;cbxDataType;trg_picker',true);
    await click('EditTuneVariableForm;cbxDataType;boundlist;Целый',true);
    for(const [key,value] of [['edtName',v.name],['edtDisplayName',v.name],['pgcValue;Int64Field',String(v.value)]]){
     await guard(true);const input=at('EditTuneVariableForm;'+key).locator('input:visible');need(await input.count()===1,'unique definition field required');
     effect=true;await input.fill(value,{timeout:remaining()});await input.press('Tab',{timeout:remaining()});
    }
    await click('EditTuneVariableForm;btnApply',true);
    await page.locator('[data-tid="EditTuneVariableForm"]').waitFor({state:'hidden',timeout:remaining()});
    await guard();current=await inspect();
    need(current.port_guid===previous.port_guid&&current.definitions.length===previous.definitions.length+1
     &&previous.definitions.every((d,i)=>JSON.stringify(d)===JSON.stringify(current.definitions[i])),'Add changed retained definitions');
    const added=current.definitions.at(-1);need(added.name===v.name&&added.label===v.name&&added.value===v.value,'definition readback differs');
   }
  }
  // Close a read-only inspection; Done commits only the newly created defaults.
  await click(root+(t.parameters.read_only?';btnClose':';btnDone'));
  if(t.parameters.read_only){
   await page.waitForFunction(root=>!document.querySelector('[data-tid='+JSON.stringify(root)+']')?.checkVisibility({checkVisibilityCSS:true})||document.querySelector('[data-tid="msgbox;tlb;yes"]')?.checkVisibility({checkVisibilityCSS:true}),root,{timeout:remaining()});
   if(await at(root).count()){
    need(await page.locator('[data-tid="msgbox;cnt;cnt"]').textContent()==='Вы действительно хотите закрыть мастер настройки?','owned Close confirmation required');
    effect=true;await at('msgbox;tlb;yes').click({timeout:remaining()});
   }
  }
  await page.locator('[data-tid='+JSON.stringify(root)+']').waitFor({state:'hidden',timeout:remaining()});
  const after=await readNode(page,b);need(after.verified&&after.surface==='graph'&&after.node_id===before.node_id,'graph return unconfirmed');
  return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:effect,node_context:after,variable_boundary:current};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,cleanup_complete:!effect,effect_possible:effect,error:String(error.message).slice(0,1000),port_opened:opened};}
}
