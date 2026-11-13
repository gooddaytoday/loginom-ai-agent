import {validatePreparedNodeContext,readPreparedNodeContext} from './node-context.mjs';
import {readSupernodeContext,readSupernodeBrowser} from './supernode-context.mjs';

export function makeSupernodeConfigureCode(binding,options){
 validatePreparedNodeContext(binding);
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
  const boundary=task.parameters.boundary;
  if(!boundary){need(before.ports.length===2,'existing 1-to-1 boundary required');}
  else{
   need(before.ports.length===0||before.ports.length===2,'partial or unsupported boundary; no edits');
   const existing=before.ports.length===2;
   if(existing)need(before.ports.every((p,i)=>p.name===boundary[i===0?'input':'output'].name&&p.label===boundary[i===0?'input':'output'].label
    &&p.kind==='table'&&(i!==0||p.optional===false)),'existing connected boundary differs; destructive edits are unsupported');
   if(!existing)for(const [index,direction] of ['input','output'].entries()){
    const old=await inventory();need(old.ports.length===index,'unexpected port count before Add');
    await click(grid+';tbl;GroupHeader;'+index+';AddButton');
    const guid=index===0?'05969d66-64f2-4d9f-b714-a2c9821461db':'d2278de3-ce0b-407b-9839-c05d14a1debe';
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
    need(port?.name===boundary[direction].name&&port.label===boundary[direction].label&&port.kind==='table'
     &&(index!==0||port.optional===false),'port UI readback differs');
   }
  }
  const final=await inventory();
  need(final.ports.length===2&&final.ports.every(p=>p.kind==='table')&&final.ports[0].optional===false,'one required table input and table output required');
  const configuration={verified:true,inventory_complete:true,mode:'tabular_boundary',node_context:owner,
   boundary:Object.fromEntries(final.ports.map((p,i)=>[i===0?'input':'output',{kind:'table',name:p.name,label:p.label,record_id:p.record_id,...(i===0?{requirement:'required'}:{})}]))};
  return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:effect,node_context:owner,configuration};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,cleanup_complete:!effect,effect_possible:effect,node_context:owner??null,error:String(error.message).slice(0,1500)};}
}

export async function configureSupernode(channel,parameters,{request}){
 const changed=await channel.configureSupernode(parameters);
 if(request.finish==='close')return changed;
 await channel.perform({condition:'accept native Supernode boundary',ready:s=>s.wizard?.stage==='supernode',identity:s=>s.prepared_node_context,
  resolve:s=>{const next=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
   if(next.length!==1)throw Error('Supernode Next unavailable; inspect native btnError');
   return {verb:'wizard_step',ref:next[0].ref,expected_stage:'done'};}});
 const done=await channel.observe({condition:'Supernode boundary accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
 return {...changed,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
