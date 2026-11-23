import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariablesReplaceParameters,resolveVariablesReplaceParameters} from '../lib/variables-replace-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
import {configureVariablesReplace} from '../lib/variables-replace-procedure.mjs';
const rule=(name,type,extra)=>({variable:{kind:'input_variable',name},type,pairs:[],other:'keep',...extra});
const rules=[rule('Color','string',{pairs:[{from:'red',to:'blue'}],case_sensitive:false}),
 rule('Code','string',{regex_pairs:[{pattern:'^Ab-[0-9]+$',replacement:'matched'}],case_sensitive:true}),
 rule('Amount','real',{pairs:[{from:1.2,to:2.5}],precision:0.1}),rule('Other','string',{other:'null',case_sensitive:true})];
const request={target:{kind:'existing',type:'variables.replace',ref:{document_id:'d',workflow_id:'w',node_id:'n'}},inputs:[],variable_inputs:[],mappings:[],mode:'rules',parameters:{},finish:'execute',read:{ports:[],variable_ports:[0]}};
test('rules accepts native match controls and null-only rule, exact remains strict',()=>{
 assert.doesNotThrow(()=>validateVariablesReplaceParameters({rules},'rules',request));
 for(const r of rules)assert.throws(()=>validateVariablesReplaceParameters({rules:[r]},'exact',request));
 assert.deepEqual(resolveVariablesReplaceParameters({rules},rules.map(r=>({name:r.variable.name,type:r.type})),[],'rules'),rules);
});
test('rules refuses mixed groups, coercion, captures, invalid precision and unsupported policies before UI',()=>{
 for(const r of [{...rules[1],pairs:[{from:'a',to:'b'}]}, {...rules[1],type:'integer'},
  {...rules[1],regex_pairs:[{pattern:'a',replacement:'$1'}]}, {...rules[1],regex_pairs:[{pattern:'',replacement:'x'}]},
  {...rules[2],precision:-1},{...rules[2],precision:Infinity},{...rules[2],pairs:[{from:true,to:2.5}]},
  {...rules[3],other:'value'},{...rules[0],precision:0},{...rules[0],pairs:[{from:'red',to:'x'},{from:'RED',to:'y'}]}])
  assert.throws(()=>validateVariablesReplaceParameters({rules:[r]},'rules',request),JSON.stringify(r));
});
test('registered rules uses the production handler and preserves settings on unchanged execute',()=>{
 const handlers=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}).nodeApplyHandlers;
 assert.ok(handlers.get('variables.replace').modes.includes('rules'));
 assert.equal(isUnchangedTransformExecution(request),true);
});
test('native rule readback ignores JSON object key order in model requests',async()=>{
 const owner={verified:true,surface:'wizard',document_id:'d',workflow_id:'w',node_id:'n'};
 const rule={variable:{name:'Other',kind:'input_variable'},type:'string',pairs:[],case_sensitive:true,other:'null'};
 const page={waitForTimeout:async()=>{},locator:()=>assert.fail('No gesture needed for this saved rule')};
 const state={verified:true,inventory_complete:true,node_context:owner,selected:'Other',
  input_fields:[{name:'Other',label:'Other',type:'string',mode:'manual'}],pairs:[],other:{mode:'null'},case_sensitive:true};
 const result=await configureVariablesReplace(page,{binding:{workflow_ref:{prefix:'MF;TF'}},mode:'rules',
  parameters:{rules:[rule]},new_node:false,finish:'close',deadline:Date.now()+5000},async()=>owner,async()=>state);
 assert.equal(result.status,'SUCCEEDED',result.error);
 assert.deepEqual(result.configuration.rules,[rule]);
});
