import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSmoothingParameters,resolveSmoothingParameters} from '../lib/smoothing-parameters.mjs';
import {smoothingOutputOrigins} from '../lib/smoothing-output.mjs';
const request={target:{kind:'new'},mappings:[]};
const parameters={smoothing:[{field:'X',lambda:1},{field:'R',period:6}]};
const fields=[{name:'RowID',type:'integer',data_kind:'Непрерывный'},{name:'X',type:'integer',data_kind:'Непрерывный'},{name:'R',type:'real',data_kind:'Непрерывный'},{name:'Tag',type:'string',data_kind:'Дискретный'}];
test('HP requires explicit unique rules and refuses ambiguous strength before UI',()=>{
 validateSmoothingParameters(parameters,'hodrick_prescott',request);
 validateSmoothingParameters({smoothing:[]},'hodrick_prescott',request);
 validateSmoothingParameters({},'hodrick_prescott',{...request,target:{kind:'existing'}});
 for(const p of [{},{smoothing:[{field:'X'}]},{smoothing:[{field:'X',lambda:1,period:6}]},{smoothing:[{field:'X',lambda:0.01}]},{smoothing:[{field:'X',period:20001}]},{smoothing:[{field:'X',lambda:NaN}]},{smoothing:[{field:'X',lambda:1},{field:'X',lambda:2}]},{...parameters,bindings:{}}])assert.throws(()=>validateSmoothingParameters(p,'hodrick_prescott',request));
 assert.throws(()=>validateSmoothingParameters(parameters,'wavelet',request));
});
test('HP resolves continuous numeric fields, omission, replacement and output collisions',()=>{
 const resolved=resolveSmoothingParameters(parameters,fields);
 assert.deepEqual(resolved.filter(f=>f.used).map(f=>f.name),['X','R']);
 assert.throws(()=>resolveSmoothingParameters({smoothing:[{field:'Tag',lambda:1}]},fields),/continuous/);
 assert.throws(()=>resolveSmoothingParameters({smoothing:[{field:'Z',lambda:1}]},fields),/unknown/);
 assert.throws(()=>resolveSmoothingParameters(parameters,[...fields,{name:'X_S',type:'real'}]),/collision/);
 assert.equal(resolveSmoothingParameters({smoothing:[]},resolved).some(f=>f.used),false);
 assert.deepEqual(resolveSmoothingParameters({},resolved),resolved);
 const sources=[...fields,...['X','R'].map(name=>({name:name+'_S',type:'real'}))].map((f,index)=>({...f,record_id:String(index)}));
 const origins=smoothingOutputOrigins({input_fields:fields,fields:resolved.filter(f=>f.type!=='string')},sources);
 assert.deepEqual(origins.map(f=>[f.name,f.type,f.smoothed]),[['RowID','integer',false],['X','integer',false],['R','real',false],['Tag','string',false],['X_S','real',true],['R_S','real',true]]);
 assert.throws(()=>smoothingOutputOrigins({input_fields:fields,fields:resolved},sources.slice(0,-1)));
 sources.at(-1).type='integer';assert.throws(()=>smoothingOutputOrigins({input_fields:fields,fields:resolved},sources));
});

test('published HP rules pass production structural validation before handler preflight',async()=>{
 const {smoothingParametersSchema}=await import('../lib/node-api.mjs');
 const {validateActionParameters}=await import('../lib/action-catalog.mjs');
 for(const p of [parameters,{smoothing:[]},{smoothing:[{field:'X',lambda:0.0625}]},{smoothing:[{field:'R',period:20000}]}])assert.doesNotThrow(()=>validateActionParameters(smoothingParametersSchema,p));
 for(const p of [{smoothing:[{field:'X'}]},{smoothing:[{field:'X',lambda:1,period:6}]},{smoothing:[{field:'X',lambda:0.01}]},{smoothing:[{field:'X',period:20001}]}])assert.throws(()=>validateActionParameters(smoothingParametersSchema,p));
});
