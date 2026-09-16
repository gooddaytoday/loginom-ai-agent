import test from 'node:test';import assert from 'node:assert/strict';
import {createReformNodeSupport,validateReformParameters,validateReformInlineSources} from '../lib/reform-node.mjs';
const request=()=>({target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'});
const parameters=()=>({changes:[{field:{kind:'input_field',name:'Raw'},name:'Amount',type:'real'}]});
test('reform private support uses the common separate-port lifecycle and field parameter schema',()=>{
 const support=createReformNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'}),handler=support.nodeApplyHandlers.get('transform.reform_columns');
 assert.deepEqual(handler.modes,['scalar']);assert.equal(handler.output_wizard,'separate');assert.equal(handler.parameter_schema.properties.changes.items.properties.field.properties.kind.enum[0],'input_field');
 assert.equal(typeof handler.configurationReadback,'function');assert.equal(typeof support.nodeApplyDriverFactory,'function');
});
test('public reform parameters reject unsupported modes, missing inputs and input exclusions before browser work',()=>{
 assert.doesNotThrow(()=>validateReformParameters(parameters(),'scalar',request()));
 assert.throws(()=>validateReformParameters(parameters(),'expression',request()));
 const p=parameters();p.changes[0].field.kind='configured_field';assert.throws(()=>validateReformParameters(p,'scalar',request()));
 for(const mutate of [r=>r.inputs=[],r=>r.inputs[0].input=1,r=>r.read.ports=[1],r=>r.mappings=[{direction:'input',port:0,fields:[{source:{kind:'configured_field',name:'Raw'},excluded:true}]}],r=>{r.finish='close';r.mappings=[{direction:'input',port:0}]}]){const r=request();mutate(r);assert.throws(()=>validateReformParameters(parameters(),'scalar',r));}
});
test('reform conditional mapping cannot prune a current source name as obsolete',()=>{
 const owner={verified:true,document_id:'d',workflow_id:'w',node_id:'n'},c={verified:true,inventory_complete:true,source_identity_verified:true,node_context:owner,fields:[{name:'Amount',label:'Amount',type:'real',excluded:false}]};
 const m={verified:true,inventory_complete:true,source_identity_verified:true,node_context:owner,mapping_wizard:'DerivedDataSourceMappingEngineOutputPortWizard',source_fields:[{name:'Amount',label:'Amount',type:'real'}],target_fields:[{name:'Amount',source:null,required:false,excluded:false,inherited:false}]};
 assert.throws(()=>validateReformInlineSources(c,m),/current/);m.target_fields[0].name='Old';assert.equal(validateReformInlineSources(c,m).length,1);
});
