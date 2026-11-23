import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readVariablesColumnUnionBrowser,readVariablesColumnUnionContext} from '../lib/variables-coluniondatavar-context.mjs';
import {validateVariablesColumnUnionInventory} from '../lib/variables-coluniondatavar-parameters.mjs';
import {variablesColumnUnionConfigurationReadback} from '../lib/variables-coluniondatavar-readback.mjs';
function fixture(){
 const base='MF;TF;WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard',root={id:'root',checkVisibility:()=>true,contains:e=>e===button},button={id:'button'};
 const component={el:{dom:button},pressed:true};
 const document={querySelectorAll:q=>q==='[data-tid="'+base+'"]'?[root]:q==='[data-tid="'+base+';btnAutoSyncThroughColumns"]'?[button]:[]};
 return {root,button,component,read:()=>vm.runInNewContext('('+readVariablesColumnUnionBrowser.toString()+')("MF;TF")',{document,Ext:{getCmp:()=>component}})};
}
test('automatic mapping reads native toggle without depending on the loading grid or invoking engine getters',()=>{
 const f=fixture();Object.defineProperty(f.component,'FEngine',{get(){throw Error('RPC forbidden');}});
 assert.equal(f.read().mapping,'automatic');f.component.pressed=false;assert.equal(f.read().mapping,'custom');
 for(const mutate of [f=>f.component.el.dom={},f=>delete f.component.pressed,f=>f.root.checkVisibility=()=>false,f=>f.root.contains=()=>false]){const f=fixture();mutate(f);assert.equal(f.read().verified,false);}
});
test('read-only mapping context rejects owner changes and port-wizard surfaces',async()=>{
 const binding={workflow_ref:{prefix:'MF;TF'}},page={evaluate:async()=>({verified:true,mapping:'automatic'})};let n=0;
 assert.equal((await readVariablesColumnUnionContext(page,binding,async()=>({verified:true,surface:'wizard',node_id:String(++n)}))).verified,false);
 assert.equal((await readVariablesColumnUnionContext(page,binding,async()=>({verified:true,surface:'wizard',output_port:{port:0}}))).verified,false);
});
test('source inventories preserve typed NULL, real, empty string, false and zero; unsafe types and precision refuse',()=>{
 const output=()=>({complete:true,count:5,variables:[['integer',null],['real',0.1],['string',''],['boolean',false],['integer','0']].map(([type,value])=>({name:type,type,cell:{type,value,is_null:value===null,...(type==='integer'&&value!==null?{precision:'exact_integer'}:{})}}))});
 validateVariablesColumnUnionInventory([output(),output()]);
 for(const mutate of [o=>o.complete=false,o=>o.count=129,o=>o.variables[0].type='datetime',o=>o.variables[4].cell.value='9007199254740993',o=>o.variables[1].cell.value=Infinity,o=>o.variables[0].cell.value=0]){const o=output();mutate(o);assert.throws(()=>validateVariablesColumnUnionInventory([o,output()]));}
});
test('readback projects actual native output names against both source schemas and requires verified finish',()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'u'},owner={...node,verified:true};
 const phase=(phase,value)=>({phase,receipt_id:'op:'+phase,status:'verified',value:{verified:true,cleanup_complete:true,...value}});
 const inputs=[0,1].map(input=>({kind:'variables',input,output:0,source:{...node,node_id:'s'+input}}));
 const phases=[phase('input_mapping',{inputs,source_fields:[0,1].map(input=>({input,name:'a0',label:'Параметр',type:'integer'}))}),phase('configure',{configuration:{mapping:'automatic',node_context:owner}}),phase('finish',{settings_applied:true}),phase('read',{variable_ports:[{variables:['a0','a1'].map(name=>({name,label:'Параметр',type:'integer'}))}]})];
 const r=variablesColumnUnionConfigurationReadback({node,phases,operation_id:'op'});
 assert.deepEqual(r.mapping_fields,[{input:0,source_name:'a0',output_name:'a0'},{input:1,source_name:'a0',output_name:'a1'}]);
 phases[3].value.variable_ports[0].variables[1].type='string';assert.throws(()=>variablesColumnUnionConfigurationReadback({node,phases,operation_id:'op'}));
});
