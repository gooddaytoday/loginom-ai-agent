import test from 'node:test';
import vm from 'node:vm';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import assert from 'node:assert/strict';
import {Page,build,origin,scriptGraphFixture} from './support/workspace-ui-fixture.mjs';

for(const label of ['JavaScript','JS:_Value','Summary','Итог;_Value','Left|Right'])test('native JS guard ignores editable label '+label,async()=>{
  const f=scriptGraphFixture(label),s=await f.page.observe();
  for(const element of [f.body,f.text,f.setting,f.views,f.input,f.output,f.add]){
    const target=s.ui.elements.find(e=>e.tid===element.getAttribute('data-tid'));assert.ok(target);assert.deepEqual(target.allowed_actions,[]);
    if(element!==f.add)assert.equal(target.signature.native_graph.status,'script');
    const forged=structuredClone(s);forged.ui.elements.find(e=>e.ref===target.ref).allowed_actions=['click','double_click','press','drag'];
    for(const verb of ['click','double_click','press']){
      const r=await vm.runInContext('('+workspaceUiCapability.toString()+')',f.page.context)(f.page,{mode:'act',expected_build:build,expected_origin:origin,snapshot:forged,action:{verb,ref:target.ref,...(verb==='press'?{key:'F3'}:{})}});assert.notEqual(r.status,'SUCCEEDED');assert.equal(r.effect_possible,false);
    }
  }
  assert.deepEqual(f.page.events,[]);
});
for(const icon of ['bg-vendor-icon-importtext','bg-vendor-icon-calculator'])test('real non-JS '+icon+' keeps actions beside JS data0 + service AddPort',async()=>{
  const f=scriptGraphFixture('Summary',icon),js=f.page.add('g','MF;TF-1;Graph;JS:_Value','',{x:400,y:100,width:100,height:60});
  f.page.add('g','MF;TF-1;Graph;JS:_Value;Output_Data-0','',{x:520,y:100,width:15,height:20});f.page.add('g','MF;TF-1;Graph;JS:_Value;Output_Add');
  f.byTid.get(js.getAttribute('data-tid')).FIconCls='bg-vendor-icon-javascript';
  const s=await f.page.observe();
  for(const e of [f.body,f.text,f.setting,f.views,f.input,f.output])assert.ok(s.ui.elements.find(x=>x.tid===e.getAttribute('data-tid')).allowed_actions.includes('click'));
  const target=s.ui.elements.find(x=>x.tid===f.output.getAttribute('data-tid'));
  const result=await f.page.act({verb:'click',ref:target.ref},s);assert.equal(result.status,'SUCCEEDED');assert.equal(f.page.events.length,1);
});
for(const [name,change]of Object.entries({
  icon:f=>f.node.FIconCls='bg-vendor-icon-javascript',missingIcon:f=>delete f.node.FIconCls,
  model:f=>f.page.app.ModelForm=class Other{},container:f=>f.model.FDiagram.FmxGraph.container={},
  node:f=>f.model.FDiagram.FNodes.FCollection[0]={...f.node},data:f=>f.node.data={},
  nodeCell:f=>f.node.FCell={},port:f=>f.node.FPorts[1].FCollection[0]={...f.port},portData:f=>f.port.data={},
  portCell:f=>f.port.FCell={},portParent:f=>f.port.parent={},cellParent:f=>f.port.FCell.parent={},
  duplicateNode:f=>f.model.FDiagram.FNodes.FCollection.push({...f.node}),duplicatePort:f=>f.node.FPorts[1].FCollection.push({...f.port}),
  hole:f=>delete f.node.FPorts[0].FCollection[0],oversized:f=>f.node.FPorts[0].FCollection.length=101,
  absentCollection:f=>delete f.node.FPorts[0].FCollection,
  foreignTid:f=>f.page.add('g',f.output.getAttribute('data-tid'),'',f.output.box,f.output.parentElement),
}))test('fresh act refuses '+name+' after genuine non-JS observation',async()=>{
  const f=scriptGraphFixture('Summary','bg-vendor-icon-importtext'),before=await f.page.observe(),target=before.ui.elements.find(e=>e.tid===f.output.getAttribute('data-tid'));
  assert.ok(target.allowed_actions.includes('click'));change(f);
  const r=await f.page.act({verb:'click',ref:target.ref},before);assert.notEqual(r.status,'SUCCEEDED');assert.equal(r.effect_possible,false);assert.deepEqual(f.page.events,[]);
});
test('native accessors cannot execute while classifying an unconfirmed graph port',async()=>{
  const f=scriptGraphFixture('Summary','bg-vendor-icon-importtext');let calls=0;
  Object.defineProperty(f.node,'FIconCls',{get(){calls++;throw Error('must not call');}});
  const s=await f.page.observe();assert.deepEqual(s.ui.elements.find(e=>e.tid===f.output.getAttribute('data-tid')).allowed_actions,[]);assert.equal(calls,0);
});

test('a native JS name shaped like a link never becomes an out-of-scope link',async()=>{
  const f=scriptGraphFixture('Neutral'),old=f.tid,next='MF;TF-1;Graph;A|Output_Data-0|B|Input_Data-0';
  for(const e of [f.body,f.text,f.setting,f.views,f.input,f.output,f.add])e.attrs['data-tid']=e.attrs['data-tid'].replace(old,next);
  const s=await f.page.observe();
  for(const e of [f.body,f.output]){const target=s.ui.elements.find(x=>x.tid===e.getAttribute('data-tid'));assert.deepEqual(target.allowed_actions,[]);assert.equal(target.signature.native_graph.status,'script');}
});
for(const fault of ['hole','accessor','oversized','missing'])test('unknown sibling port collection '+fault+' denies that node ports and preserves unrelated non-JS',async()=>{
  const f=scriptGraphFixture('First','bg-vendor-icon-importtext');let getters=0;
  const second=f.page.add('g','MF;TF-1;Graph;Second','',{x:400,y:100,width:100,height:60});
  const out=f.page.add('g','MF;TF-1;Graph;Second;Output_Data-0','',{x:520,y:110,width:15,height:20});
  const collection=f.node.FPorts[0];
  if(fault==='hole')delete collection.FCollection[0];
  if(fault==='accessor')Object.defineProperty(collection,'FCollection',{get(){getters++;throw Error('getter');}});
  if(fault==='oversized')collection.FCollection.length=101;
  if(fault==='missing')delete collection.FCollection;
  const s=await f.page.observe();assert.deepEqual(s.ui.elements.find(e=>e.tid===f.output.getAttribute('data-tid')).allowed_actions,[]);
  assert.ok(s.ui.elements.find(e=>e.tid===out.getAttribute('data-tid')).allowed_actions.includes('click'));assert.equal(getters,0);
});
test('fresh native edge is outside node deny while its renamed JS endpoint remains denied',async()=>{
  const f=scriptGraphFixture('JS:_Value');f.page.add('g','MF;TF-1;Graph;Source');
  const link=f.page.add('g','MF;TF-1;Graph;Source|Output_Data-0|JS:_Value|Input_Data-0','',{x:400,y:250,width:100,height:10});
  const s=await f.page.observe(),edge=s.ui.elements.find(e=>e.tid===link.getAttribute('data-tid'));
  assert.ok(edge.allowed_actions.includes('click'));assert.equal(edge.signature.native_graph,undefined);
  assert.deepEqual(s.ui.elements.find(e=>e.tid===f.output.getAttribute('data-tid')).allowed_actions,[]);
});
test('native classifier does not turn a lexical JavaScript denial into a non-JS allowance',async()=>{
  const f=scriptGraphFixture('JavaScript','bg-vendor-icon-importtext'),s=await f.page.observe();
  const port=s.ui.elements.find(e=>e.tid===f.output.getAttribute('data-tid'));
  assert.equal(port.signature.native_graph.status,'non_script');assert.deepEqual(port.allowed_actions,[]);
});

// Execute the exact production classifier block to distinguish its no-getter
// contract from older, unrelated workspace readers that still use Items.
const classifierSource=workspaceUiCapability.toString();
const classifierBlock=classifierSource.slice(classifierSource.indexOf('const nativeGraphControls='),classifierSource.indexOf('const scopeOf = element =>'));
function classifyOnly(f) {
  const graphContainer=f.model.FDiagram.FmxGraph.container;
  const context=vm.createContext({bg:{app:f.page.app},graphContainer,graphQueryable:true,graphPrefix:'MF;TF-1;Graph;',
    nativeGraphElements:f.page.document.all().filter(e=>graphContainer.contains(e)&&e.getAttribute('data-tid')?.includes(';Graph;')),
    ownedGraph:e=>graphContainer.contains(e)&&e.getAttribute('data-tid')?.startsWith('MF;TF-1;Graph;'),
    getTid:e=>e?.getAttribute('data-tid'),charge:()=>{},refOf:()=> 'opaque-test-ref',target:f.body});
  return vm.runInContext('(()=>{'+classifierBlock+'return nativeGraphControl(target);})()',context);
}
for(const icon of ['bg-vendor-icon-importtextfile','bg-vendor-icon-javascript'])test('own FItems classifier never invokes inherited Items: '+icon,()=>{
  const f=scriptGraphFixture('Renamed',icon),form=f.page.app.Application.FInstance.FMainForm;
  assert.equal(Object.hasOwn(form,'Items'),false);assert.equal(Object.hasOwn(form,'FItems'),true);
  let prototype=form,depth=0;while(!Object.getOwnPropertyDescriptor(prototype,'Items')){prototype=Object.getPrototypeOf(prototype);depth++;}
  assert.equal(depth,4);let calls=0;
  Object.defineProperty(prototype,'Items',{get(){calls++;throw Error('getter forbidden');}});
  const result=classifyOnly(f);assert.equal(result.status,icon.endsWith('javascript')?'script':'non_script');assert.equal(calls,0);
});
for(const fault of ['missing','accessor','inherited','wrong_model','wrong_container'])test('own FItems '+fault+' denies classifier and fresh act without accessor invocation',async()=>{
  const f=scriptGraphFixture('NativeInput','bg-vendor-icon-importtextfile'),form=f.page.app.Application.FInstance.FMainForm;
  const before=await f.page.observe(),target=before.ui.elements.find(e=>e.tid===f.tid);assert.ok(target.allowed_actions.includes('click'));
  const original=form.FItems;let calls=0;
  // Keep unrelated legacy readers on their prior model. The classifier must
  // independently reject invalid FItems rather than fall back through Items.
  Object.defineProperty(form,'Items',{value:original});
  if(fault==='missing')delete form.FItems;
  if(fault==='accessor')Object.defineProperty(form,'FItems',{get(){calls++;throw Error('getter forbidden');}});
  if(fault==='inherited'){Object.setPrototypeOf(form,{FItems:original});delete form.FItems;}
  if(fault==='wrong_model')form.FItems={Workspace:{getActiveTab:()=>({Controller:{FController:{}}})}};
  if(fault==='wrong_container'){
    const model=new f.page.app.ModelForm();model.FDiagram={...f.model.FDiagram,FmxGraph:{...f.model.FDiagram.FmxGraph,container:{}}};
    form.FItems={Workspace:{getActiveTab:()=>({Controller:{FController:model}})}};
  }
  assert.equal(classifyOnly(f).status,'unconfirmed');assert.equal(calls,0);
  const after=await f.page.observe();assert.deepEqual(after.ui.elements.find(e=>e.tid===f.tid).allowed_actions,[]);
  const result=await f.page.act({verb:'click',ref:target.ref},before);
  assert.notEqual(result.status,'SUCCEEDED');assert.equal(result.effect_possible,false);assert.equal(calls,0);assert.deepEqual(f.page.events,[]);
});
test('ordinary import body operates through vendor FItems fixture',async()=>{
  const f=scriptGraphFixture('NativeInput','bg-vendor-icon-importtextfile'),s=await f.page.observe();
  const target=s.ui.elements.find(e=>e.tid===f.tid);assert.equal(target.signature.native_graph.status,'non_script');
  assert.ok(target.allowed_actions.includes('click'));
  assert.equal((await f.page.act({verb:'click',ref:target.ref},s)).status,'SUCCEEDED');assert.deepEqual(f.page.events,['click']);
});
