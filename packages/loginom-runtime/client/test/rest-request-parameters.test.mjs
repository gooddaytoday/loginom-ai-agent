import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRestRequestParameters} from '../lib/rest-request-parameters.mjs';
import {restRequestReadback} from '../lib/rest-request-node.mjs';
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0,1]},mappings:[],finish:'execute'};
const parameters=()=>({connection:{name:'Echo',base_url:'https://httpbin.org/anything'},query_parameters:[{name:'RequestId',field:'RequestId'},{name:'Key',field:'Key'}]});
test('REST stage 1 accepts a new GET/query connection and preserves existing settings',()=>{
 assert.doesNotThrow(()=>validateRestRequestParameters(parameters(),'request',request));
 assert.doesNotThrow(()=>validateRestRequestParameters({},'request',{...request,target:{kind:'existing'},inputs:[]}));
 const reused=parameters();delete reused.connection.base_url;
 assert.doesNotThrow(()=>validateRestRequestParameters(reused,'request',request));
 for(const finish of ['done','close']){
  assert.throws(()=>validateRestRequestParameters(parameters(),'request',{...request,finish}),/finish=execute/);
  assert.doesNotThrow(()=>validateRestRequestParameters({},'request',{...request,target:{kind:'existing'},inputs:[],finish}));
 }
});
test('REST readback requires the same node and a verified Done receipt',()=>{
 const node={document_id:'d',workflow_id:'w',node_id:'n'},operation_id='rest1';
 const phases=[
  {phase:'configure',status:'verified',receipt_id:'rest1:configure',value:{configuration:{verified:true,node_context:node,query_parameters:parameters().query_parameters}}},
  {phase:'node_finish',status:'verified',receipt_id:'rest1:node_finish',value:{settings_applied:true,mode:'done',node_context:node}},
 ];
 const result=restRequestReadback({node,phases,operation_id});
 assert.equal(result.package_persistence_verified,false);
 assert.deepEqual(result.query_parameters,parameters().query_parameters);
 for(const alter of [p=>{p[0].value.configuration.node_context={...node,node_id:'other'};},p=>{p[1].value.mode='close';},p=>{p[1].receipt_id='other:node_finish';}]){
  const changed=structuredClone(phases);alter(changed);assert.throws(()=>restRequestReadback({node,phases:changed,operation_id}));
 }
});
test('REST refuses credentials, unsupported settings and invalid bindings before graph mutation',()=>{
 for(const url of ['file:///tmp/request','https://user:secret@example.org/','https://example.org/?token=secret','https://example.org/#fragment','not a URL']){
  const p=parameters();p.connection.base_url=url;assert.throws(()=>validateRestRequestParameters(p,'request',request),/base_url/);
 }
 for(const patch of [{method:'POST'},{authentication:'Basic'},{verify_certificate:false},{headers:[]},{body:'data'}])
  assert.throws(()=>validateRestRequestParameters({...parameters(),...patch},'request',request),/stage 1/);
 const duplicate=parameters();duplicate.query_parameters.push({name:'Key',field:'Other'});
 assert.throws(()=>validateRestRequestParameters(duplicate,'request',request),/unique/);
 assert.throws(()=>validateRestRequestParameters(parameters(),'request',{...request,inputs:[{input:2}]}),/input 0/);
 assert.throws(()=>validateRestRequestParameters({},'request',request),/requires/);
});
