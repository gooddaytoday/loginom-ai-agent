import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readJavascriptG1Type} from './javascript-g1-type.mjs';

function fixture(){
  const session={},native={},nodeData={};
  const code={id:'owned-code',isConnected:true,getBoundingClientRect:()=>({width:100,height:100})};
  const root={isConnected:true,querySelectorAll:()=>[code]};
  const codeView={el:{dom:code}};
  const engine={$S:session,$:{$OW:0,$O:18,$I:781}};
  const moduleSystem={$S:session,$:{$OW:0,$O:18,$I:900}};
  const model={FModelNode:nodeData,FView:{el:{dom:root}}};
  const controller={FWizardForm:model,FEngine:engine,FModuleSystem:moduleSystem};
  model.FWizardItems={FItems:[{FPages:[codeView],FWizard:controller}]};
  const tab={Controller:{Node:{data:{node:native}},FController:model}};
  const connection={UserName:'jsteach',Connected:true};
  const realm=vm.createContext({getComputedStyle:()=>({visibility:'visible'}),
    Ext:{getCmp:()=>codeView},
    bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection},
      Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
  const args={root,native,binding:{tab,nodeData},prefix:'MF;TF-1',account:'jsteach',build:'7.4.2'};
  const read=()=>vm.runInContext('('+readJavascriptG1Type.toString()+')',realm)(args);
  return {read,engine,moduleSystem,controller,connection,model,tab,args};
}

test('owned code controller gives two selected interfaces of one held native engine',()=>{
  const f=fixture(),result=f.read();
  assert.equal(result.verified,true);
  assert.equal(result.same_remote_object,true);
  assert.equal(result.same_session,true);
  assert.equal(result.distinct_interfaces,true);
  assert.equal(result.engine.object,18);
  assert.equal(result.engine.interface,781);
  assert.equal(result.module_system.interface,900);
  assert.equal(result.full_type_observed,false);
  assert.equal(result.runtime_full_type,null);
});

test('G1 type reader records distinct engine and module proxy identities without inferring a cast',()=>{
  for(const mutate of [f=>f.moduleSystem.$.$O++,f=>f.moduleSystem.$S={},
    f=>f.moduleSystem.$.$I=f.engine.$.$I]){
    const f=fixture();mutate(f);
    const result=f.read();
    assert.equal(result.verified,true);
    assert.equal(result.same_session,f.engine.$S===f.moduleSystem.$S);
    assert.equal(result.same_remote_object,f.engine.$S===f.moduleSystem.$S
      &&f.engine.$.$OW===f.moduleSystem.$.$OW&&f.engine.$.$O===f.moduleSystem.$.$O);
    assert.equal(result.distinct_interfaces,f.engine.$.$I!==f.moduleSystem.$.$I);
  }
});

test('G1 type reader rejects changed wizard owner or absent selected engine',()=>{
  for(const mutate of [f=>f.connection.UserName='foreign',f=>f.model.FModelNode={},
    f=>f.controller.FEngine=null]){
    const f=fixture();mutate(f);assert.throws(f.read);
  }
});

test('G1 type reader never invokes proxy getters',()=>{
  const f=fixture();let calls=0;
  Object.defineProperty(f.engine,'FullType',{get(){calls++;throw Error('remote getter');}});
  Object.defineProperty(f.moduleSystem,'Code',{get(){calls++;throw Error('remote getter');}});
  assert.equal(f.read().verified,true);
  assert.equal(calls,0);
});

test('G1 cached wizard arrays never invoke accessor or inherited item slots',()=>{
  for(const location of ['items','pages'])for(const kind of ['accessor','inherited']){
    const f=fixture();let calls=0;
    const array=location==='items'?f.model.FWizardItems.FItems:f.model.FWizardItems.FItems[0].FPages;
    const previous=array[0];delete array[0];
    if(kind==='accessor')Object.defineProperty(array,'0',{get(){calls++;throw Error('remote getter');}});
    if(kind==='inherited')Object.setPrototypeOf(array,Object.assign(Object.create(Array.prototype),{0:previous}));
    assert.throws(f.read,/wizard array/);assert.equal(calls,0);
  }
});

test('G1 permits an empty conditional page item without changing its owned code controller',()=>{
  const f=fixture();f.model.FWizardItems.FItems.push({FPages:[],FWizard:{}});
  assert.equal(f.read().verified,true);
});
