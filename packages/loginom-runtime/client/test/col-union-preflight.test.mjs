import test from 'node:test';
import assert from 'node:assert/strict';
import {colUnionInputPorts} from '../lib/col-union-preflight.mjs';
const request=(inputs=[])=>({inputs:inputs.map(input=>({input})),mappings:[],parameters:{}});
const existing={ref:{node_id:'union'},inputs:[0,1,2]};
const graph={links:[0,1,2].map(input=>({target:'union',input}))};
test('existing three-input union preserves every connected port with inputs omitted',()=>{
 assert.deepEqual(colUnionInputPorts(request(),existing,graph),[0,1,2]);
 assert.deepEqual(colUnionInputPorts(request([2]),existing,graph),[0,1,2]);
 assert.deepEqual(colUnionInputPorts(request([0,1]),null,{links:[]}),[0,1]);
});
test('missing source, unallocated mapping and absent third selector refuse before target mutation',()=>{
 assert.throws(()=>colUnionInputPorts(request(),existing,{links:graph.links.slice(0,2)}));
 assert.throws(()=>colUnionInputPorts({...request([0,1]),mappings:[{direction:'input',port:2}]},null,{links:[]}));
 assert.throws(()=>colUnionInputPorts({...request([0,1]),parameters:{col_union:{determining_input:'third'}}},null,{links:[]}));
 assert.throws(()=>colUnionInputPorts(request(),{...existing,inputs:[0,2]},graph));
});
test('saved two-input union refuses a new third input before mutation',()=>{
 for(const inputs of [[0,1],[0,1,2]])
  assert.throws(()=>colUnionInputPorts(request([2]),{...existing,inputs},{links:graph.links.slice(0,2)}),/saved two-input union/);
});
