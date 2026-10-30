import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSlidingWindowParameters,resolveSlidingWindowParameters} from '../lib/sliding-window-parameters.mjs';
const request={target:{kind:'new'},mappings:[]};
const parameters={windows:[{field:'Sales',history:3,horizon:1}],incomplete_records:'keep_incomplete'};
test('lag validates explicit new settings and preserves existing omissions',()=>{
 validateSlidingWindowParameters(parameters,'lag',request);
 validateSlidingWindowParameters({windows:[],incomplete_records:'drop_added'},'lag',request);
 validateSlidingWindowParameters({},'lag',{...request,target:{kind:'existing'}});
 for(const p of [{},{windows:[]},{incomplete_records:'drop_added'},{...parameters,bindings:{}},{...parameters,incomplete_records:'unknown'}])assert.throws(()=>validateSlidingWindowParameters(p,'lag',request));
 for(const history of [-1,1.5,'3',134217728,NaN])assert.throws(()=>validateSlidingWindowParameters({...parameters,windows:[{field:'Sales',history,horizon:0}]},'lag',request));
 assert.throws(()=>validateSlidingWindowParameters({...parameters,windows:[...parameters.windows,...parameters.windows]},'lag',request));
});
test('complete window replacement retains source identity and clears unlisted fields',()=>{
 const fields=[{name:'Month',type:'string'},{name:'Sales',type:'integer'},{name:'Price',type:'real'}];
 assert.deepEqual(resolveSlidingWindowParameters(parameters,fields).map(f=>[f.name,f.history,f.horizon]),[['Month',0,0],['Sales',3,1],['Price',0,0]]);
 assert.throws(()=>resolveSlidingWindowParameters(parameters,fields.slice(0,1)),/Sales/);
 assert.throws(()=>resolveSlidingWindowParameters(parameters,[...fields,{name:'Sales_H_1',type:'integer'}]),/collision/);
 assert.throws(()=>resolveSlidingWindowParameters(parameters,[{name:'Sales',type:'variant'}]),/type/);
});
