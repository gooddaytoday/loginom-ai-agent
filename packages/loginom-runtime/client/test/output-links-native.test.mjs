import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fixture from './fixtures/output-links-native.mjs';
import {hydrate as hydrateNative} from './fixtures/output-links-hydrate.mjs';
import {makeWorkspaceUiCode,validateUiAction} from '../lib/workspace-ui.mjs';
import {closePreparedWizard,wizardCloseBinding,cancelledWizardReady} from '../lib/node-wizard-close.mjs';
const after=fixture['native-selected-complete.json'],prepared=fixture['source-open.json'];
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:after.ledger[0].node_id}};
const executablePath=process.env.LOGINOM_FIXTURE_BROWSER;
test('serialized output Links preserve native pair ownership across guarded gestures', {skip:!executablePath}, async t=>{
 const {chromium}=createRequire(import.meta.url)('playwright');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:after.viewport});
 await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 const execute=(page,options)=>new Function('page',`return (${makeWorkspaceUiCode({expected_build:after.loginom_build,expected_origin:after.origin,prepared_node_context:binding,...options})})(page)`)(page);
 const hydrate=(page,capture,mode)=>hydrateNative(page,capture,mode,prepared);
 const observe=async page=>{const initial=await execute(page,{mode:'observe'});assert.equal(initial.status,'SUCCEEDED');const ref=initial.output.wizard.root_ref;const result=await execute(page,{mode:'observe',root_ref:ref});assert.equal(result.status,'SUCCEEDED');return result.output;};
 const metadata=e=>e.signature?.date_time_cell;
 const linked=s=>s.ui.elements.filter(e=>metadata(e)?.link);
 const pairs=s=>s.ui.elements.filter(e=>metadata(e)?.role==='output_source'&&metadata(e)?.link);
 const action=s=>{const source=pairs(s)[0],target=linked(s).find(e=>metadata(e).role==='output_target'&&metadata(e).link.key===metadata(source).link.key);return {verb:'drag',source_ref:source.ref,target_ref:target.ref};};
 const mutate=async(page,variant)=>page.evaluate(variant=>{
  const {get,ledger,model,c,draw,grids,link}=globalThis.__nativeFixture,r=ledger[0],pair=Object.values(draw.FLinks)[0];
  switch(variant){
   case 'foreign_opening':r.operation_id='foreign';break;
   case 'missing_ledger':globalThis.__loginomDockPreparationV1.outputPortOpenReceipts.clear();break;
   case 'duplicate_opening':globalThis.__loginomDockPreparationV1.outputPortOpenReceipts.set('duplicate',{...r});break;
   case 'foreign_port':r.portGuid='foreign';break;
   case 'foreign_index':r.nativeIndex=1;break;
   case 'foreign_node':r.node.FGuid='foreign';break;
   case 'foreign_workflow':r.workflow_id='foreign';break;
   case 'foreign_tree_port':r.portTree.FModelNodePort={};break;
   case 'foreign_tree_node':r.nodeTree.FModelNode={};break;
   case 'foreign_tree_group':r.portTree.ParentNode={};break;
   case 'foreign_engine':model.FModelEnginePort={};break;
   case 'foreign_controller':model.FWizardItems.FItems=[{Wizard:{}}];break;
   case 'duplicate_controller':model.FWizardItems.FItems.push({Wizard:c});break;
   case 'foreign_root':model.FView.el.dom=document.body;break;
   case 'foreign_ext':get(grids[0].view).el.dom=document.body;break;
   case 'foreign_store':c.FSourceStore={};break;
   case 'missing_record':get(grids[0].store).getData=()=>({items:[]});break;
   case 'duplicate_record':get(grids[0].store).getData=()=>({items:[...grids[0].records.map(x=>get(x.object)),pair[0]]});break;
   case 'pending_store':get(grids[0].store).getProxy=()=>({pendingOperations:{pending:{}}});break;
   case 'foreign_pair':draw.FLinks[Object.keys(draw.FLinks)[0]]=[pair[0],{}];break;
   case 'missing_pair':delete draw.FLinks[Object.keys(draw.FLinks)[0]];break;
   case 'duplicate_pair':draw.FLinks.duplicate=pair;break;
   case 'foreign_connected':pair[1].data.ConnectedRecord={};break;
   case 'foreign_selection':draw.FSelectedLinks[Object.keys(draw.FSelectedLinks)[0]]=[...pair];break;
   case 'foreign_sprite':draw.FDrawLinkItems[Object.keys(draw.FLinks)[0]].DrawDeleteButton[0].element.dom=document.body;break;
   case 'hidden_sprite':draw.FDrawLinkItems[Object.keys(draw.FLinks)[0]].DrawDeleteButton[0].attr.hidden=true;break;
   case 'duplicate_sprite':{const b=draw.FDrawLinkItems[Object.keys(draw.FLinks)[0]].DrawDeleteButton;b[1]=b[0];break;}
   case 'duplicate_row':{const grid=get(grids[0].element),row=grid.querySelector('table.x-grid-item');row.parentElement.append(row.cloneNode(true));break;}
   case 'wrong_row_ref':get(grids[0].element).querySelector('table.x-grid-item').setAttribute('data-recordid','foreign');break;
   case 'table_mode':{const es=[...document.querySelectorAll('[data-tid]')];es.find(e=>e.getAttribute('data-tid').endsWith(';rbLinks')).classList.remove('x-form-cb-checked');break;}
   case 'stale_definition':pair[1].data.DisplayName='changed';break;
   case 'stale_selection':draw.FSelectedLinks={};break;
   default:throw Error(variant);
  }
 },variant);
 try{
  await t.test('all six measured pairs use only existing opaque click/drag refs',async()=>{
   const page=await context.newPage();await hydrate(page,after);const s=await observe(page);assert.equal(s.wizard.stage,'output_mapping');assert.equal(pairs(s).length,6);
   for(const source of pairs(s)){const m=metadata(source),target=linked(s).find(e=>metadata(e).role==='output_target'&&metadata(e).link.key===m.link.key);assert.ok(target);assert.equal(m.link.source.Name,m.link.target.Name);assert.equal(m.link.owner.port.opening_operation_id,after.ledger[0].operation_id);assert.equal(m.link.owner.port.port_guid,after.ledger[0].portGuid);validateUiAction({verb:'click',ref:source.ref},s);validateUiAction({verb:'click',ref:target.ref},s);validateUiAction({verb:'drag',source_ref:source.ref,target_ref:target.ref},s);}
   const removal=linked(s).filter(e=>metadata(e).role==='output_relation_remove');assert.equal(removal.length,2);assert.equal(removal.filter(e=>e.allowed_actions.includes('click')).length,1);assert.ok(removal.every(e=>!e.allowed_actions.includes('drag')));
   assert.ok(!s.ui.elements.some(e=>e.tid?.endsWith(';btnRemoveSelectedLinks')&&e.allowed_actions.length));
   assert.throws(()=>validateUiAction({verb:'drag',source_ref:pairs(s)[0].tid,target_ref:'ui-missing'},s));assert.throws(()=>validateUiAction({verb:'click',ref:'ui-missing'},s));await page.close();
  });
  for(const variant of ['foreign_opening','missing_ledger','duplicate_opening','foreign_port','foreign_index','foreign_node','foreign_workflow','foreign_tree_port','foreign_tree_node','foreign_tree_group','foreign_engine','foreign_controller','duplicate_controller','foreign_root','foreign_ext','foreign_store','missing_record','duplicate_record','pending_store','foreign_pair','missing_pair','duplicate_pair','foreign_connected','foreign_selection','foreign_sprite','hidden_sprite','duplicate_sprite','duplicate_row','wrong_row_ref','table_mode'])await t.test(variant+' denies fresh Links gestures and stale dispatch',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),a=action(before);await mutate(page,variant);const result=await execute(page,{mode:'observe',root_ref:before.wizard.root_ref});if(result.status==='SUCCEEDED'){assert.equal(linked(result.output).length,0);assert.throws(()=>validateUiAction(a,result.output));}
   let dispatched=0;const down=page.mouse.down.bind(page.mouse);page.mouse.down=async(...args)=>{dispatched++;return down(...args);};const outcome=await execute(page,{mode:'act',snapshot:before,action:a});assert.equal(outcome.status,'NOT_APPLIED');assert.equal(dispatched,0);await page.close();
  });
  for(const variant of ['duplicate_delete_dom','delete_sprites_shared_by_links','delete_dom_shared_by_links','missing_draw_item','foreign_draw_item','foreign_draw_key','missing_delete_alias'])await t.test(variant+' denies fresh and retained removal before dispatch',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),remove=linked(before).find(e=>metadata(e).role==='output_relation_remove'&&e.allowed_actions.includes('click'));
   assert.ok(remove);const request={verb:'click',ref:remove.ref};validateUiAction(request,before);
   await page.evaluate(variant=>{
    const {draw}=globalThis.__nativeFixture,key=Object.keys(draw.FSelectedLinks)[0],other=Object.keys(draw.FLinks).find(k=>k!==key),buttons=draw.FDrawLinkItems[key].DrawDeleteButton;
    if(variant==='duplicate_delete_dom')buttons[0].element.dom=buttons[1].element.dom;
    else if(variant==='delete_sprites_shared_by_links')draw.FDrawLinkItems[other].DrawDeleteButton=buttons;
    else if(variant==='delete_dom_shared_by_links')draw.FDrawLinkItems[other].DrawDeleteButton=buttons.map(b=>({...b,element:{dom:b.element.dom}}));
    else if(variant==='missing_draw_item')delete draw.FDrawLinkItems[other];
    else if(variant==='foreign_draw_item')draw.FDrawLinkItems[other].LinkID=key;
    else if(variant==='foreign_draw_key'){draw.FDrawLinkItems.constructor={...draw.FDrawLinkItems[other],LinkID:'constructor'};delete draw.FDrawLinkItems[other];}
    else buttons[0].element.dom=null;
   },variant);
   const fresh=await observe(page);assert.ok(!linked(fresh).some(e=>metadata(e).role==='output_relation_remove'&&e.allowed_actions.includes('click')));assert.throws(()=>validateUiAction(request,fresh));
   let count=0;const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{count++;return click(...args);};
   const retained=await execute(page,{mode:'act',snapshot:before,action:request});assert.equal(retained.status,'NOT_APPLIED');assert.equal(count,0);await page.close();
  });
  for(const variant of ['stale_definition','stale_selection'])await t.test(variant+' rejects retained stale references before dispatch',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),a=action(before);await mutate(page,variant);let dispatched=0;page.mouse.down=async()=>{dispatched++;};const outcome=await execute(page,{mode:'act',snapshot:before,action:a});assert.equal(outcome.status,'NOT_APPLIED');assert.equal(dispatched,0);await page.close();
  });
  // Counterfactual states only: SetSource(null) settlement has not been
  // measured. Alter native records/draw aliases, never observer output/actions.
  const unbind=async(page,key='184_190',clearLabels=false)=>page.evaluate(({key,clearLabels})=>{
   const {draw}=globalThis.__nativeFixture,pair=draw.FLinks[key];
   pair[0].data.ConnectedRecord=null;pair[1].data.ConnectedRecord=null;
   if(clearLabels){pair[1].data.SourceDisplayName=null;pair[1].data.SourceDataType=null;}
   delete draw.FLinks[key];delete draw.FSelectedLinks[key];delete draw.FDrawLinkItems[key];
  },{key,clearLabels});
  for(const clearLabels of [false,true])await t.test('one synthetic unbound pair stages a fresh guarded reconnect; labels cleared='+clearLabels,async()=>{
   const page=await context.newPage();await hydrate(page,after);const original=await observe(page),retained=action(original);await unbind(page,'184_190',clearLabels);
   const fresh=await observe(page);assert.equal(pairs(fresh).length,1);assert.equal(linked(fresh).length,2);assert.equal(metadata(pairs(fresh)[0]).link.state,'unbound');
   assert.ok(!fresh.ui.elements.some(e=>e.allowed_actions.some(v=>['finish_wizard','execute_wizard'].includes(v))));
   const request=action(fresh);validateUiAction(request,fresh);let count=0;const down=page.mouse.down.bind(page.mouse);page.mouse.down=async(...args)=>{count++;return down(...args);};
   const stale=await execute(page,{mode:'act',snapshot:original,action:retained});assert.equal(stale.status,'NOT_APPLIED');assert.equal(count,0);
   const result=await execute(page,{mode:'act',snapshot:fresh,action:request});assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.equal(count,1);await page.close();
  });
  for(const variant of ['foreign_opening','missing_ledger','duplicate_opening','foreign_port','foreign_index','foreign_node','foreign_workflow','foreign_tree_port','foreign_engine','foreign_controller','foreign_root','foreign_ext','foreign_store','missing_record','duplicate_record','pending_store','duplicate_row','wrong_row_ref','foreign_connected','foreign_pair','duplicate_pair'])await t.test('unbound '+variant+' rejects fresh and retained reconnect before dispatch',async()=>{
   const page=await context.newPage();await hydrate(page,after);await unbind(page);const before=await observe(page),request=action(before);await mutate(page,variant);
   const fresh=await execute(page,{mode:'observe',root_ref:before.wizard.root_ref});if(fresh.status==='SUCCEEDED'){assert.equal(linked(fresh.output).length,0);assert.throws(()=>validateUiAction(request,fresh.output));}else assert.equal(fresh.status,'NOT_APPLIED');let count=0;page.mouse.down=async()=>{count++;};
   const result=await execute(page,{mode:'act',snapshot:before,action:request});assert.equal(result.status,'NOT_APPLIED');assert.equal(count,0);await page.close();
  });
  for(const variant of ['second_unbound','undefined_connection','foreign_connection','stale_definition','missing_draw','duplicate_draw_alias','stale_bound_ref'])await t.test('unbound '+variant+' fails before dispatch',async()=>{
   const page=await context.newPage();await hydrate(page,after);await unbind(page);const before=await observe(page),request=action(before);
   if(variant==='second_unbound')await unbind(page,'185_191');else await page.evaluate(variant=>{
    const {draw,get,grids}=globalThis.__nativeFixture,target=get(grids[1].records.find(x=>String(x.internalId)==='190').object);
    if(variant==='undefined_connection')target.data.ConnectedRecord=undefined;
    else if(variant==='foreign_connection')target.data.ConnectedRecord={};
    else if(variant==='stale_definition')target.data.OriginType=1;
    else if(variant==='missing_draw')delete draw.FDrawLinkItems[Object.keys(draw.FDrawLinkItems)[0]];
    else if(variant==='duplicate_draw_alias'){const keys=Object.keys(draw.FDrawLinkItems),dom=get(grids[0].element);draw.FDrawLinkItems[keys[0]].DrawDeleteButton=[{element:{dom}}];draw.FDrawLinkItems[keys[1]].DrawDeleteButton=[{element:{dom}}];}
    else {const pair=Object.values(draw.FLinks)[0];pair[0].data.Index=99;}
   },variant);
   let count=0;page.mouse.down=async()=>{count++;};const result=await execute(page,{mode:'act',snapshot:before,action:request});assert.equal(result.status,'NOT_APPLIED');assert.equal(count,0);await page.close();
  });
  for(const variant of ['retained_id','retained_definition','retained_native_record','retained_draw_alias','retained_source_label','target_pending'])await t.test('unbound '+variant+' invalidates the whole inventory before dispatch',async()=>{
   const page=await context.newPage();await hydrate(page,after);await unbind(page);const before=await observe(page),request=action(before);
   await page.evaluate(variant=>{
    const {get,grids,draw}=globalThis.__nativeFixture,records=grids[0].records.map(x=>get(x.object)),record=records[1];
    if(variant==='retained_id')record.data.ID=100;
    else if(variant==='retained_definition')record.data.DataKind=1;
    else if(variant==='retained_source_label')Object.values(draw.FLinks)[0][1].data.SourceDisplayName='changed';
    else if(variant==='target_pending')get(grids[1].store).getProxy=()=>({pendingOperations:{pending:{}}});
    else if(variant==='retained_draw_alias'){const key=Object.keys(draw.FDrawLinkItems)[0];draw.FDrawLinkItems[key]={...draw.FDrawLinkItems[key]};}
    else {const replacement={...record,data:{...record.data}};records[1]=replacement;const pair=Object.values(draw.FLinks).find(pair=>pair[0]===record);pair[0]=replacement;pair[1].data.ConnectedRecord=replacement;get(grids[0].store).getData=()=>({items:records,getSource:()=>({items:records})});}
   },variant);
   let count=0;page.mouse.down=async()=>{count++;};const result=await execute(page,{mode:'act',snapshot:before,action:request});assert.equal(result.status,'NOT_APPLIED');assert.equal(count,0);await page.close();
  });
  await t.test('unbound obscured Close fallback cannot claim dispatch or discarded draft',async()=>{
   const page=await context.newPage();await hydrate(page,after);await unbind(page);const before=await observe(page),binding=wizardCloseBinding(before);
   assert.equal(cancelledWizardReady(before,binding),false);let count=0;page.mouse.click=async()=>{count++;};
   const channel={observe:async options=>{const state=await observe(page);if(!options.ready(state))throw Error('discard not observed');return state;},perform:async options=>{
    const state=await observe(page);assert.ok(options.ready(state));const request=options.resolve(state);validateUiAction(request,state);
    const result=await execute(page,{mode:'act',snapshot:state,action:request});assert.equal(result.status,'NOT_APPLIED');assert.equal(result.error.code,'UI_REFERENCE_OBSCURED');throw Error('Close has no verified interaction point');
   }};
   // The inert captured layout does not establish a clickable Close point or
   // a post-unlink cancellation callback. Do not inject a success context.
   await assert.rejects(closePreparedWizard(channel),/Close has no verified interaction point/);assert.equal(count,0);assert.equal(cancelledWizardReady(await observe(page),binding),false);await page.close();
  });
  await t.test('unbound lost drag reply remains ambiguous without replay',async()=>{
   const page=await context.newPage();await hydrate(page,after);await unbind(page);const fresh=await observe(page);let count=0;const down=page.mouse.down.bind(page.mouse);page.mouse.down=async(...args)=>{count++;await down(...args);throw Error('lost reconnect reply');};
   const result=await execute(page,{mode:'act',snapshot:fresh,action:action(fresh)});assert.equal(result.status,'AMBIGUOUS');assert.equal(count,1);await page.close();
  });
  await t.test('real guarded drag checks native references and dispatches once',async()=>{
   const page=await context.newPage();await hydrate(page,after);const s=await observe(page);let downCount=0,upCount=0;const down=page.mouse.down.bind(page.mouse),up=page.mouse.up.bind(page.mouse);page.mouse.down=async(...args)=>{downCount++;return down(...args);};page.mouse.up=async(...args)=>{upCount++;return up(...args);};const outcome=await execute(page,{mode:'act',snapshot:s,action:action(s)});assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome.error));assert.equal(downCount,1);assert.equal(upCount,1);await page.close();
  });
  for(const role of ['output_source','output_relation_remove'])await t.test('real guarded '+role+' click dispatches exactly once',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),ref=linked(before).find(e=>metadata(e).role===role&&e.allowed_actions.includes('click')).ref;let count=0;const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{count++;return click(...args);};const result=await execute(page,{mode:'act',snapshot:before,action:{verb:'click',ref}});assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.equal(count,1);await page.close();
  });
  await t.test('lost selected-relation click reply remains ambiguous without replay',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),ref=linked(before).find(e=>metadata(e).role==='output_relation_remove'&&e.allowed_actions.includes('click')).ref;let count=0;const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{count++;await click(...args);throw Error('lost reply after click');};const result=await execute(page,{mode:'act',snapshot:before,action:{verb:'click',ref}});assert.equal(result.status,'AMBIGUOUS');assert.equal(count,1);await page.close();
  });
  await t.test('lost drag reply remains ambiguous without replay',async()=>{
   const page=await context.newPage();await hydrate(page,after);const s=await observe(page);let downCount=0;const down=page.mouse.down.bind(page.mouse);page.mouse.down=async(...args)=>{downCount++;await down(...args);throw Error('lost reply after mouse down');};const outcome=await execute(page,{mode:'act',snapshot:s,action:action(s)});assert.equal(outcome.status,'AMBIGUOUS');assert.equal(downCount,1);await page.close();
  });
 }finally{await context.close();await browser.close();}
});
