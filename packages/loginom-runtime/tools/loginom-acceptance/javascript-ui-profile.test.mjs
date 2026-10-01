import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeJavascriptUiProfileCode} from './javascript-ui-profile.mjs';
import {managedJavascriptStageFixture} from '../../client/test/support/javascript-managed-stage-fixture.mjs';

function fixture(page='Code') {
  const f=managedJavascriptStageFixture(),base='MF;TF-1;WizrdMCF';
  const element=f.element;
  f.element=(id,tid)=>{
    const result=element(id,tid);result.classList=new Set();result.classList.contains=key=>result.classList.has(key);
    result.matches=()=>false;return result;
  };
  f.previews.length=0;
  const session={};
  f.controller.FEngine={$S:session,$:{$OW:0,$O:18,$I:781}};
  f.controller.FModuleSystem={$S:session,$:{$OW:0,$O:19,$I:900}};
  f.controller.$className='JavaScriptCodeWizard';
  const inventory=[],components=new Map(),current=page==='Code'?f.code:f.element('columns',base+';JavaScriptColumnsWizard');
  f.code.rect.width=page==='Code'?300:0;current.parentElement=f.root;
  f.root.contains=element=>{
    for(let next=element;next;next=next.parentElement)if(next===f.root)return true;
    return false;
  };
  const query=f.root.querySelectorAll;
  f.root.querySelectorAll=selector=>selector.startsWith('button,')?inventory
    :selector==='[data-tid]'||selector==='[data-tid='+JSON.stringify(current.tid)+']'?[current]:query(selector);
  const documentQuery=f.context.document.querySelectorAll;
  f.context.document.querySelectorAll=selector=>selector==='[data-tid='+JSON.stringify(base)+']'?[f.root]
    :selector==='.x-mask,.bg-mask-message,.x-mask-msg'?[...f.masks,...f.plainMasks]:documentQuery(selector);
  const getCmp=f.context.Ext.getCmp;
  if(page==='Columns')components.set(current.id,{el:{dom:current}});
  f.context.Ext.getCmp=id=>components.get(id)??getCmp(id);
  const add=(name,{role='button',type=null,label=name,value=undefined}={})=>{
    const element=f.element('control-'+inventory.length,base+';'+name);
    element.parentElement=current;element.tagName=type?'INPUT':'BUTTON';element.textContent=label;
    element.checked=true;element.disabled=false;
    element.getAttribute=key=>key==='data-tid'?element.tid:key==='role'?role:key==='type'?type:null;
    const component={el:{dom:element},text:label,$className:'Ext.button.Button',...(value!==undefined?{value}:{})};
    components.set(element.id,component);inventory.push(element);return {element,component};
  };
  add('btnNext',{label:'Далее'});
  const generation=add('chbGenerate',{role:'checkbox',type:'checkbox',label:'Генерировать выходные столбцы'});
  add('btnClose',{label:'Закрыть'});
  const run=()=>Function('return ('+makeJavascriptUiProfileCode(f.task)+')')()(f.page);
  return {...f,run,add,inventory,components,current,generation};
}

function disabledDeleteMask(f) {
  const header=f.element('delete-header',f.current.tid+';colTargetDelete'),grid=f.element('target-grid',f.current.tid+';grdTargetColumns');
  grid.parentElement=f.current;header.parentElement=grid;
  const mask=f.element('disabled-mask',null);mask.parentElement=header;
  mask.classList=new Set(['x-mask','x-border-box']);mask.classList.contains=key=>mask.classList.has(key);
  mask.matches=()=>false;
  header._extData={maskEl:{dom:mask}};
  const gridView={el:{dom:grid},ownerCt:f.components.get(f.current.id)};
  const column={el:{dom:header},disabled:true,ownerCt:gridView};
  f.components.set(grid.id,gridView);f.components.set(header.id,column);
  grid.contains=element=>[grid,header,mask].includes(element);
  const oldContains=f.current.contains;f.current.contains=element=>grid.contains(element)||oldContains(element);
  const query=f.context.document.querySelectorAll;
  f.context.document.querySelectorAll=selector=>selector==='[data-tid='+JSON.stringify(header.tid)+']'?[header]
    :selector==='[data-tid='+JSON.stringify(grid.tid)+']'?[grid]:query(selector);
  f.plainMasks.push(mask);return {header,grid,mask,column,gridView};
}

test('scoped UI observation permits only the existing exactly bound disabled delete-header mask',async()=>{
  const f=fixture('Columns');disabledDeleteMask(f);
  const result=await f.run();
  assert.equal(result.pending,true); // General stage remains conservative.
  assert.equal(result.ui_profile.quiet_owner_verified,true);
  assert.equal(result.ui_profile.mask_classification.disabled_delete_mask_count,1);
  assert.equal(result.ui_profile.mask_classification.blocker_count,0);
  assert.ok(Object.values(result.ui_profile.mask_classification.observations[0].checks).every(Boolean));
});

for(const change of [m=>m.column.disabled=false,m=>m.header._extData.maskEl.dom={},m=>m.column.ownerCt={},
  m=>m.mask.parentElement=m.grid,m=>m.gridView.el.dom={},m=>m.mask.rect.width++,
  m=>m.mask.classList.add('foreign')])test('UI profile refuses changed disabled-header identity '+change.toString(),async()=>{
  const f=fixture('Columns'),m=disabledDeleteMask(f);change(m);await assert.rejects(f.run,/quiet owned/);
});

for(const page of ['Columns','Code'])test('actual serialized retained UI profile observes '+page+' controls without an engine request',async()=>{
  const f=fixture(page);let getters=0;
  Object.defineProperty(f.controller.FEngine,'FullType',{get(){getters++;throw Error('remote getter');}});
  const result=await f.run();
  assert.equal(result.owner_verified,true);assert.deepEqual(result.owner,f.task.owner);
  assert.equal(result.ui_profile.controls.length,3);
  assert.equal(result.ui_profile.controls[1].checked,true);
  assert.equal(result.ui_profile.helper_invoked,false);
  assert.equal(result.ui_profile.explicit_execute_requested,false);
  assert.equal(result.ui_profile.hidden_execution_absence_claimed,false);
  assert.equal(result.ui_profile.engine?.full_type_observed??false,false);
  assert.equal(result.ui_profile.engine?.engine.object??null,page==='Code'?18:null);
  assert.equal(result.ui_profile.engine?.same_remote_object??null,page==='Code'?false:null);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=16384);assert.equal(getters,0);
});

test('composite checkbox wrapper and inner control share one exact native identity',async()=>{
  const f=fixture(),inner=f.element('checkbox-input',null);
  inner.parentElement=f.generation.element;inner.tagName='INPUT';inner.checked=false;
  inner.getAttribute=key=>key==='type'?'checkbox':null;
  f.inventory.push(inner);
  const result=await f.run();
  assert.equal(result.ui_profile.controls.length,3);
  assert.equal(result.ui_profile.controls[1].tid,f.generation.element.tid);
});

test('only own scalar picker caches are read; inherited/accessor values never run',async()=>{
  for(const kind of ['scalar','accessor','inherited']){
    const f=fixture(),picker=f.add('enginePicker',{role:'combobox',label:'Движок'});let calls=0;
    if(kind==='scalar')picker.component.value='ChakraCore';
    if(kind==='accessor')Object.defineProperty(picker.component,'value',{get(){calls++;throw Error('getter');}});
    if(kind==='inherited')Object.setPrototypeOf(picker.component,{get value(){calls++;throw Error('inherited getter');}});
    const result=await f.run(),cache=result.ui_profile.controls[3].picker_cache;
    assert.equal(cache.state,kind==='scalar'?'own_scalar':kind==='accessor'?'accessor_not_read':'absent');
    assert.equal(cache.value,kind==='scalar'?'ChakraCore':undefined);assert.equal(calls,0);
  }
});

for(const change of [
  f=>f.lease.identity='foreign',f=>f.task.deadline=Date.now()-1,f=>f.held.wizardRoot={},
  f=>f.tab.Controller.Node.data.node={},f=>f.native.ParentNode.FGuid='foreign',
  f=>f.controller.FWizardForm={},f=>f.model.FModelNode={},f=>f.connection.UserName='foreign',
  f=>f.plainMasks.push(f.element('mask','')),f=>f.dialogs.push(f.element('foreign-dialog','foreign')),
  f=>f.context.document.querySelectorAll=()=>[f.root,f.root],
  f=>f.add('btnNext'),f=>f.inventory[0].tid='foreign',
  f=>f.add('oversize',{label:'X'.repeat(513)}),
  f=>Array.from({length:65},(_,i)=>f.add('button'+i)),
  f=>f.add('picker',{role:'combobox',value:{foreign:true}}),
  f=>f.add('picker',{role:'combobox',value:'x'.repeat(257)})])
  test('serialized profile refuses ambiguity/drift/bound '+change.toString(),async()=>{
    const f=fixture();change(f);await assert.rejects(f.run);
  });

test('foreign mask refuses before reading control inventory',async()=>{
  const f=fixture(),query=f.root.querySelectorAll;let reads=0;
  f.root.querySelectorAll=selector=>{if(selector.startsWith('button,')){reads++;throw Error('inventory read');}return query(selector);};
  f.plainMasks.push(f.element('mask',''));await assert.rejects(f.run,/quiet owned/);assert.equal(reads,0);
});

test('profile applies the existing complete managed response bound',async()=>{
  const f=fixture();for(let i=0;i<50;i++)f.add('button'+i,{label:'Ё'.repeat(250)});
  await assert.rejects(f.run,/response bound/);
});

const entry=fileURLToPath(new URL('./javascript-ui-profile-live.mjs',import.meta.url));
for(const args of [[],['--case','foreign'],['--case','ui-code','--headless','true'],
  ['--case','ui-declared','--source','x'],['--case','ui-code','--x11-no-focus']])
  test('fixed headed UI entry refuses unassigned choices '+JSON.stringify(args),()=>{
    const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});
    assert.equal(result.status,1);assert.match(result.stderr,/Fixed UI profile|Only assigned UI profile/);
  });
