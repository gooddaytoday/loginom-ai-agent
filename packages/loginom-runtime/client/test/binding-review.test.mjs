import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFilterParameters} from '../lib/filter-node.mjs';
const binding={parameter:'/groups/0/0/value',variable:{kind:'control',input:0,name:'Limit'}};
const scalar={field:{kind:'input_field',name:'Amount'},type:'integer',operator:'>'};
const request={target:{kind:'new'},variable_inputs:[{kind:'control',input:0}],inputs:[{input:0}],read:{ports:[0,1]},finish:'done',mappings:[],bindings:[binding]};
test('bound scalar plus legacy variable list refuses during validation before target',()=>{
 const p={groups:[[{...scalar},{...scalar,operator:'in',values:{kind:'variable',name:'List'}}]]};
 assert.throws(()=>validateFilterParameters(p,'conditions',request),/BINDING_PARAMETER_UNSUPPORTED/);
});
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
test('binding inventory has one public location in configuration',()=>{
 const config=nodeApplyResultSchema.properties.configuration.properties;
 const filter=config.readback.anyOf.find(s=>s.properties.kind.enum.includes('row_filter'));
 assert.ok(config.bindings);assert.equal(filter.properties.bindings,undefined);
});
import {configureVariableBinding} from '../lib/variable-binding-procedure.mjs';
test('common variable gesture retains the caller row_filter and verified Filter gate',async()=>{
 const s={wizard:{root_ref:'same',stage:'row_filter'},node_filter:{verified:true},ui:{elements:[{tid:'B;VariableControl;trg_picker',ref:'trigger',allowed_actions:['click']}]}};
 const ready=x=>x.wizard?.stage==='row_filter'&&x.node_filter?.verified===true;
 const channel={perform:async o=>{assert.equal(o.ready({...s,wizard:{...s.wizard,stage:'foreign'}}),false);assert.equal(o.ready({...s,node_filter:{verified:false}}),false);throw Error('OWNED_STAGE_REFUSAL');}};
 await assert.rejects(configureVariableBinding({channel,state:s,base:'B',ready}),/OWNED_STAGE_REFUSAL/);
});
import {validateBuiltinBindingSource} from '../lib/variable-binding-source.mjs';
test('builtin source validation follows saved mapped names and IDs rather than target alias',()=>{
 const r={target:{kind:'existing'},bindings:[{...binding,variable:{...binding.variable,name:'Threshold'}}],mappings:[],parameters:{}};
 const source={variables:[{id:7,name:'Limit',type:'integer',cell:{is_null:false,value:'5'}}]};
 const mapping={fields:[{name:'Threshold',id:2,source:{id:7,name:'Limit'}}]};
 assert.doesNotThrow(()=>validateBuiltinBindingSource(source,r,mapping));
 const bad=structuredClone(mapping);bad.fields[0].source.id=8;
 assert.throws(()=>validateBuiltinBindingSource(source,r,bad),/BINDING_VARIABLE_MISSING/);
});
import {validateFilterBindingValues} from '../lib/filter-bindings.mjs';
for(const existing of [false,true])for(const fault of ['type','NULL'])test('bound '+(existing?'saved':'calculator-source')+' operand uses a typed '+fault+' refusal',()=>{
 const p=existing?{}:{groups:[[scalar]]},native={rows:[{kind:'condition',type:'integer'}],control_variables:[{name:'Limit',type:fault==='type'?'string':'integer',is_null:fault==='NULL',value:5}]};
 assert.throws(()=>validateFilterBindingValues(p,[binding],native),fault==='type'?/BINDING_TYPE_MISMATCH/:/BINDING_NULL_UNSUPPORTED/);
});
