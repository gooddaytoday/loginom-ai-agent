import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import fixture from './fixtures/output-links-presence-native.mjs';
import {hydrate} from './fixtures/output-links-hydrate.mjs';
import {makeWorkspaceUiCode,validateUiAction} from '../lib/workspace-ui.mjs';

const capture=fixture['native-preflight.json'],prepared=fixture['copy-open.json'];
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:capture.ledger[0].node_id}};
const executablePath=process.env.LOGINOM_FIXTURE_BROWSER;
test('measured output Links property presence survives guarded removal', {skip:!executablePath},async t=>{
 const {chromium}=createRequire(import.meta.url)('playwright');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:capture.viewport});
 await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 const execute=(page,options)=>new Function('page',`return (${makeWorkspaceUiCode({expected_build:capture.loginom_build,expected_origin:capture.origin,prepared_node_context:binding,...options})})(page)`)(page);
 const observe=async page=>{const initial=await execute(page,{mode:'observe'});assert.equal(initial.status,'SUCCEEDED');const result=await execute(page,{mode:'observe',root_ref:initial.output.wizard.root_ref});assert.equal(result.status,'SUCCEEDED');return result.output;};
 const linked=s=>s.ui.elements.filter(e=>e.signature?.date_time_cell?.link);
 const removal=s=>linked(s).filter(e=>e.signature.date_time_cell.role==='output_relation_remove');
 const setup=async()=>{const page=await context.newPage();await hydrate(page,capture,null,prepared,fixture['draw-button-presence-preflight.json'].controller_pending);return page;};
 const save=async(name,value)=>{if(process.env.LOGINOM_PRESENCE_EVIDENCE){await mkdir(process.env.LOGINOM_PRESENCE_EVIDENCE,{recursive:true});await writeFile(join(process.env.LOGINOM_PRESENCE_EVIDENCE,name+'.json'),JSON.stringify(value,null,2)+'\n');}};
 try{
  await t.test('measured five absent properties and selected own array permit one guarded click',async()=>{
   const page=await setup();const presence=await page.evaluate(()=>Object.entries(globalThis.__nativeFixture.draw.FDrawLinkItems).map(([key,item])=>({key,hasOwn:Object.hasOwn(item,'DrawDeleteButton'),type:typeof item.DrawDeleteButton,isArray:Array.isArray(item.DrawDeleteButton)})));
   assert.equal(presence.filter(x=>!x.hasOwn&&x.type==='undefined').length,5);assert.equal(presence.filter(x=>x.hasOwn&&x.isArray).length,1);
   const s=await observe(page);assert.equal(linked(s).length,14);assert.equal(removal(s).length,2);const refs=removal(s).filter(e=>e.allowed_actions.includes('click'));assert.equal(refs.length,1);
   const request={verb:'click',ref:refs[0].ref};validateUiAction(request,s);let dispatch=0;const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{dispatch++;return click(...args);};
   const result=await execute(page,{mode:'act',snapshot:s,action:request});assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.equal(dispatch,1);
   await save('measured',{presence,observation:s,request,result,dispatch,synthetic:false,server_requests:0});await page.close();
  });
  for(const kind of ['absent','undefined','null','array'])await t.test('hydrator preserves synthetic '+kind+' and hasOwn without normalization',async()=>{
   const d=structuredClone(capture),link=d.linkNative.links.find(x=>!x.selected);link.drawItem.buttonPresence={hasOwn:kind!=='absent',kind};link.drawItem.buttons=[];
   const page=await context.newPage();await hydrate(page,d,null,prepared,fixture['draw-button-presence-preflight.json'].controller_pending);const state=await page.evaluate(key=>{const x=globalThis.__nativeFixture.draw.FDrawLinkItems[key];return {hasOwn:Object.hasOwn(x,'DrawDeleteButton'),type:typeof x.DrawDeleteButton,isNull:x.DrawDeleteButton===null,isArray:Array.isArray(x.DrawDeleteButton)};},link.key);
   assert.equal(state.hasOwn,kind!=='absent');assert.equal(state.isNull,kind==='null');assert.equal(state.isArray,kind==='array');assert.equal(state.type,kind==='absent'||kind==='undefined'?'undefined':'object');
   const s=await observe(page);assert.equal(removal(s).length,kind==='absent'||kind==='array'?2:0);await page.close();
  });
  for(const variant of ['selected_absent','selected_undefined','selected_null','selected_empty','selected_inherited','unselected_undefined','unselected_null','unselected_inherited','missing_draw_inventory','missing_draw_item','missing_pair','missing_selection_inventory','null_selection_inventory','foreign_draw_key','foreign_selection','foreign_opening','foreign_port','foreign_root','foreign_ext','duplicate_pair','duplicate_sprite','shared_sprite','shared_dom','foreign_dom','hidden_selected','unselected_hidden_foreign','stale_definition','stale_ref'])await t.test(variant+' rejects retained removal before dispatch',async()=>{
   const page=await setup(),before=await observe(page),ref=removal(before).find(e=>e.allowed_actions.includes('click')).ref,request={verb:'click',ref};validateUiAction(request,before);
   await page.evaluate(variant=>{
    const {draw,ledger,model,get,grids}=globalThis.__nativeFixture,key=Object.keys(draw.FSelectedLinks)[0],other=Object.keys(draw.FLinks).find(k=>k!==key),item=draw.FDrawLinkItems[key],buttons=item.DrawDeleteButton;
    if(variant==='selected_absent')delete item.DrawDeleteButton;
    else if(variant==='selected_undefined')item.DrawDeleteButton=undefined;
    else if(variant==='selected_null')item.DrawDeleteButton=null;
    else if(variant==='selected_empty')item.DrawDeleteButton=[];
    else if(variant==='selected_inherited'){delete item.DrawDeleteButton;Object.setPrototypeOf(item,{DrawDeleteButton:buttons});}
    else if(variant==='unselected_undefined')draw.FDrawLinkItems[other].DrawDeleteButton=undefined;
    else if(variant==='unselected_null')draw.FDrawLinkItems[other].DrawDeleteButton=null;
    else if(variant==='unselected_inherited')Object.setPrototypeOf(draw.FDrawLinkItems[other],{DrawDeleteButton:undefined});
    else if(variant==='missing_draw_inventory')delete draw.FDrawLinkItems;
    else if(variant==='missing_draw_item')delete draw.FDrawLinkItems[other];
    else if(variant==='missing_pair')delete draw.FLinks[other];
    else if(variant==='missing_selection_inventory')delete draw.FSelectedLinks;
    else if(variant==='null_selection_inventory')draw.FSelectedLinks=null;
    else if(variant==='foreign_draw_key')draw.FDrawLinkItems[other].LinkID=key;
    else if(variant==='foreign_selection')draw.FSelectedLinks[key]=[...draw.FLinks[key]];
    else if(variant==='foreign_opening')ledger[0].operation_id='foreign';
    else if(variant==='foreign_port')ledger[0].portGuid='foreign';
    else if(variant==='foreign_root')model.FView.el.dom=document.body;
    else if(variant==='foreign_ext')get(grids[1].view).el.dom=document.body;
    else if(variant==='duplicate_pair')draw.FLinks.duplicate=draw.FLinks[key];
    else if(variant==='duplicate_sprite')buttons[1]=buttons[0];
    else if(variant==='shared_sprite')draw.FDrawLinkItems[other].DrawDeleteButton=buttons;
    else if(variant==='shared_dom')draw.FDrawLinkItems[other].DrawDeleteButton=buttons.map(b=>({...b,element:{dom:b.element.dom}}));
    else if(variant==='foreign_dom')buttons[0].element.dom=document.body;
    else if(variant==='hidden_selected')buttons[0].attr.hidden=true;
    else if(variant==='unselected_hidden_foreign')draw.FDrawLinkItems[other].DrawDeleteButton=[{type:'path',attr:{hidden:true,globalAlpha:0},element:{dom:document.body}}];
    else if(variant==='stale_definition')draw.FLinks[key][1].data.ID=999;
    else buttons[1].element.dom.setAttribute('data-tid','foreign-removal-ref');
   },variant);
   const fresh=await execute(page,{mode:'observe',root_ref:before.wizard.root_ref});if(fresh.status==='SUCCEEDED'&&!['stale_definition','stale_ref'].includes(variant)){assert.equal(removal(fresh.output).length,0);assert.throws(()=>validateUiAction(request,fresh.output));}
   let dispatch=0;page.mouse.click=async()=>{dispatch++;};const result=await execute(page,{mode:'act',snapshot:before,action:request});assert.equal(result.status,'NOT_APPLIED',JSON.stringify(result.error));assert.equal(dispatch,0);await save(variant,{result,dispatch,synthetic:true});await page.close();
  });
  await t.test('measured binding lost click reply remains ambiguous with one dispatch and no replay',async()=>{
   const page=await setup(),s=await observe(page),ref=removal(s).find(e=>e.allowed_actions.includes('click')).ref;let dispatch=0;const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{dispatch++;await click(...args);throw Error('lost removal reply');};
   const result=await execute(page,{mode:'act',snapshot:s,action:{verb:'click',ref}});assert.equal(result.status,'AMBIGUOUS');assert.equal(dispatch,1);await save('lost-reply',{result,dispatch,server_requests:0});await page.close();
  });
 }finally{await context.close();await browser.close();}
});
