// The node adapter supplies an owned editor, row identity and exact picker
// predicate. Every gesture stays in the original procedure channel/receipt.
export async function configureVariableBinding({channel,observe,state,base,identity,option,committed}){
 const one=(s,p,verb)=>{const es=s.ui.elements.filter(e=>p(e)&&e.allowed_actions.includes(verb));if(es.length!==1)throw Error('Owned variable binding control unavailable');return es[0];};
 const perform=(condition,s,resolve)=>channel.perform({condition,initialObservation:s,ready:x=>x.wizard?.root_ref===s.wizard.root_ref,identity,resolve});
 const click=async(condition,s,p)=>perform(condition,s,x=>({verb:'click',ref:one(x,p,'click').ref}));
 const trigger=e=>e.tid===base+';VariableControl;trg_picker';
 let s=state;
 if(!s.ui.elements.some(trigger)){
  await click('select variable parameter mode',s,e=>e.tid===base+';SwitchButton');
  s=await observe('variable parameter mode ready',s=>s.ui.elements.some(trigger));
 }
 await click('open mapped variable choices',s,trigger);
 s=await observe('exact mapped variable choice',s=>s.ui.elements.some(option));
 await click('select exact mapped variable',s,option);
 s=await observe('mapped variable selected');
 const input=e=>e.signature.tag==='input'&&e.identity.anchor_tid===base+';VariableControl';
 await perform('commit parameter binding',s,x=>({verb:'press',ref:one(x,input,'press').ref,key:'Tab'}));
 return observe('parameter binding committed',committed);
}
