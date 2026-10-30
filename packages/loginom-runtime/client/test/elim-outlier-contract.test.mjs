import test from 'node:test';
import assert from 'node:assert/strict';
import {validateElimOutlierParameters,resolveElimOutlierParameters} from '../lib/elim-outlier-parameters.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
const fields=[{name:'RowID',type:'integer',data_kind:'Непрерывный'},{name:'X',type:'real',data_kind:'Непрерывный'},{name:'Note',type:'string',data_kind:'Дискретный'}];
const outlier={fields:['X'],method:'sd',outlier_factor:1,extreme_factor:3,ordered:false};
const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1,2]}};
test('detect contract is registered with three outputs and its own parameter namespace',()=>{
 assert.equal(NODE_TYPES['preprocessing.elim_outlier'].tabular_outputs,3);
 const support=createCandidateNodeSupport({});
 assert.deepEqual(support.nodeApplyHandlers.get('preprocessing.elim_outlier').modes,['detect']);
 const schema=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema;
 assert.ok(schema.properties.target.properties.type.enum.includes('preprocessing.elim_outlier'));
 assert.ok(schema.properties.mode.enum.includes('detect'));
 assert.deepEqual(schema.properties.parameters.properties.outlier.properties.method.enum,['sd','iqr']);
 assert.deepEqual(schema.properties.parameters.properties.ordered,{const:false});
});
test('new detect requires explicit factors, method, complete field set and ordered flag',()=>{
 assert.doesNotThrow(()=>validateElimOutlierParameters({outlier},'detect',request));
 for(const key of Object.keys(outlier))assert.throws(()=>validateElimOutlierParameters({outlier:Object.fromEntries(Object.entries(outlier).filter(([k])=>k!==key))},'detect',request));
 for(const patch of [{method:'mad'},{fields:[]},{fields:['X','X']},{fields:['']},{outlier_factor:-1},{extreme_factor:0},{extreme_factor:Infinity},{ordered:1},{policy:'clip'}])
  assert.throws(()=>validateElimOutlierParameters({outlier:{...outlier,...patch}},'detect',request));
 assert.throws(()=>validateElimOutlierParameters({outlier,fields:[]},'detect',request));
 assert.throws(()=>validateElimOutlierParameters({outlier},'apply',request));
 assert.throws(()=>validateElimOutlierParameters({outlier},'detect',{...request,mappings:[{direction:'output',port:0}]}));
 assert.throws(()=>validateElimOutlierParameters({outlier},'detect',{...request,read:{ports:[3]}}));
});
test('existing patch preserves omitted settings, validates merged factors and continuous numeric fields',()=>{
 const old={...outlier,method:'iqr',outlier_factor:1.5};
 assert.doesNotThrow(()=>validateElimOutlierParameters({},'detect',{...request,target:{kind:'existing'},inputs:[]}));
 assert.deepEqual(resolveElimOutlierParameters({},fields,old),old);
 assert.deepEqual(resolveElimOutlierParameters({outlier:{outlier_factor:2}},fields,old),{...old,outlier_factor:2});
 assert.throws(()=>resolveElimOutlierParameters({outlier:{outlier_factor:4}},fields,old),/extreme_factor/);
 for(const name of ['Note','unknown'])assert.throws(()=>resolveElimOutlierParameters({outlier:{...outlier,fields:[name]}},fields),/continuous numeric/);
 assert.throws(()=>resolveElimOutlierParameters({outlier},fields.map(f=>({...f,data_kind:'Дискретный'}))),/continuous numeric/);
});
