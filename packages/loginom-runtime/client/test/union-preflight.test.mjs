import test from 'node:test';import assert from 'node:assert/strict';
import {validateUnionGraphInputs,unionInputSchemaOrigin} from '../lib/union-preflight.mjs';
test('Union rejects missing or foreign sources and absent ports before opening previews',()=>{
 const ref={document_id:'doc',workflow_id:'flow',node_id:'source'},request={inputs:[{source:ref,output:0}]},graph={nodes:[{ref,outputs:[0]}]};
 assert.doesNotThrow(()=>validateUnionGraphInputs(request,graph));
 for(const g of [{nodes:[]},{nodes:[{ref,outputs:[1]}]},{nodes:[{ref:{...ref,workflow_id:'foreign'},outputs:[0]}]},{nodes:[graph.nodes[0],graph.nodes[0]]}])assert.throws(()=>validateUnionGraphInputs(request,g),/absent from the current graph/);
});
test('Union previews the requested source for allocated free and new dynamic inputs, retaining connected aliases',()=>{
 const existing={ref:{node_id:'union'},inputs:[0,1,2]},graph={links:[{source:'main',output:0,target:'union',input:0},{source:'other',output:0,target:'unrelated',input:1}]};
 assert.equal(unionInputSchemaOrigin(existing,graph,0),'existing_mapping');
 for(const port of [1,2,3])assert.equal(unionInputSchemaOrigin(existing,graph,port),'requested_source');
 assert.equal(unionInputSchemaOrigin(null,graph,0),'requested_source');
 graph.links.push({source:'joined',output:0,target:'union',input:1});
 assert.equal(unionInputSchemaOrigin(existing,graph,1),'existing_mapping');
});
