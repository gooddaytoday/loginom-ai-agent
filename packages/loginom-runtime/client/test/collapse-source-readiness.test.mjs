import test from 'node:test';
import assert from 'node:assert/strict';
import {collapseExistingSource} from '../lib/collapse-source-readiness.mjs';
const source={document_id:'d',workflow_id:'w',node_id:'s'},request={document_id:'d',workflow_ref:{workflow_id:'w'},target:{ref:{node_id:'t'}},inputs:[]};
const graph={complete:true,document_id:'d',workflow_ref:{workflow_id:'w'},nodes:[{ref:source}],links:[{source:'s',target:'t',input:0,output:1}]};
test('collapse inherits the actual source owner and output index',()=>assert.deepEqual(collapseExistingSource(request,graph),{source,output:1,input:0}));
test('collapse rejects changed workflow, duplicate source and ambiguous links',()=>{for(const g of [{...graph,document_id:'other'},{...graph,complete:false},{...graph,nodes:[...graph.nodes,...graph.nodes]},{...graph,links:[...graph.links,...graph.links]}])assert.throws(()=>collapseExistingSource(request,g));});
test('collapse rejects reconnect requests and allows the exact existing link',()=>{assert.throws(()=>collapseExistingSource({...request,inputs:[{source,output:0,input:0}]},graph));assert.deepEqual(collapseExistingSource({...request,inputs:[{source,output:1,input:0}]},graph),{source,output:1,input:0});});
test('unconnected existing target defers to normal target handling',()=>assert.equal(collapseExistingSource(request,{...graph,links:[]}),null));
