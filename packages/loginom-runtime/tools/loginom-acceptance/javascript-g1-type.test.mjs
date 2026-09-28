import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readJavascriptG1Type} from './javascript-g1-type.mjs';

function fixture(){
  const session={},native={},nodeData={};
  const code={id:'owned-code',isConnected:true,getBoundingClientRect:()=>({width:100,height:100})};
  const root={isConnected:true,querySelectorAll:()=>[code]};
  const engine={$S:session,$:{$OW:0,$O:18,$I:781}};
  const moduleSystem={$S:session,$:{$OW:0,$O:18,$I:900}};
  const model={FModelNode:nodeData,FView:{el:{dom:root}}};
  const controller={FWizardForm:model,FEngine:engine,FModuleSystem:moduleSystem};
  model.FWizardItems={FItems:[{FPages:[{el:{dom:code}}],FWizard:controller}]};
  const tab={Controller:{Node:{data:{node:native}},FController:model}};
  const connection={UserName:'jsteach',Connected:true};
  const realm=vm.createContext({getComputedStyle:()=>({visibility:'visible'}),
    Ext:{getCmp:()=>model.FWizardItems.FItems[0].FPages[0]},
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
  assert.equal(result.engine.object,18);
  assert.equal(result.engine.interface,781);
  assert.equal(result.module_system.interface,900);
  assert.equal(result.full_type_observed,false);
  assert.equal(result.runtime_full_type,null);
});

test('G1 type reader rejects changed owner and mismatched selected cast',()=>{
  for(const mutate of [f=>f.connection.UserName='foreign',f=>f.model.FModelNode={},
    f=>f.moduleSystem.$.$O++,f=>f.moduleSystem.$S={},f=>f.controller.FEngine=null]){
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
