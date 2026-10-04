import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCrossTableStaticImport} from '../lib/crosstable-ancestor-execution.mjs';
function fixture(){
 const ref=id=>({document_id:'d',workflow_id:'w',node_id:id});
 const graph={complete:true,document_id:'d',workflow_ref:{workflow_id:'w'},foreign_links:[],
  nodes:[['i','imports.text'],['u','transform.collapse_columns'],['c','transform.cross_table']].map(([id,type])=>({ref:ref(id),type,locked:false})),
  links:[{source:'i',target:'u',input:0,output:0},{source:'u',target:'c',input:0,output:0}]};
 const sources={imports:[{node_id:'i',configuration:{kind:'text_import',node:ref('i'),source:{connection:'Локальное',source_path:'/own/file.csv'}},
  source:{destination:'/own/file.csv',bytes:216,sha256:'a'.repeat(64),bytes_verified:true,upload_completion_verified:true}}],
  collapses:[{node_id:'u',configuration:{kind:'collapse',mode:'unpivot',node:ref('u')}}]};
 return {graph,node:ref('c'),sources};
}
test('refresh resolves only the exact verified static import across a Collapse, also after history eviction',()=>{
 const f=fixture();assert.equal(resolveCrossTableStaticImport(f.graph,f.node,f.sources).node_id,'i');
 f.graph.links=[{source:'i',target:'c',input:0,output:0}];
 assert.equal(resolveCrossTableStaticImport(f.graph,f.node,f.sources).node_id,'i');
});
for(const [name,mutate]of [
 ['incomplete graph',f=>f.graph.complete=false],
 ['foreign workflow',f=>f.graph.workflow_ref.workflow_id='other'],
 ['foreign import',f=>f.graph.nodes[0].ref.document_id='other'],
 ['locked import',f=>f.graph.nodes[0].locked=true],
 ['second input',f=>f.graph.links.push({source:'i',target:'c',input:0,output:0})],
 ['other port',f=>f.graph.links[0].output=1],
 ['dynamic source',f=>f.graph.links.push({source:'u',target:'i',input:0,output:0})],
 ['unverified Collapse',f=>f.sources.collapses=[]],
 ['duplicate provenance',f=>f.sources.imports.push(structuredClone(f.sources.imports[0]))],
 ['foreign settings',f=>f.sources.imports[0].configuration.node.node_id='other'],
 ['changed file path',f=>f.sources.imports[0].configuration.source.source_path='/own/other.csv'],
 ['unverified bytes',f=>f.sources.imports[0].source.bytes_verified=false],
 ['unverified upload',f=>f.sources.imports[0].source.upload_completion_verified=false],
 ['nonlocal source',f=>f.sources.imports[0].configuration.source.connection='HTTP'],
 ['bad hash',f=>f.sources.imports[0].source.sha256='unknown']
])test('ancestor refresh refuses '+name+' before any source action',()=>{
 const f=fixture();mutate(f);assert.throws(()=>resolveCrossTableStaticImport(f.graph,f.node,f.sources));
});
test('cold refresh requires the independently downloaded byte proof',()=>{
 const f=fixture(),s=f.sources.imports[0].source;delete s.upload_completion_verified;
 s.provenance='independent_server_file_download';s.download_completion_verified=true;
 assert.equal(resolveCrossTableStaticImport(f.graph,f.node,f.sources).node_id,'i');
 s.download_completion_verified=false;assert.throws(()=>resolveCrossTableStaticImport(f.graph,f.node,f.sources));
});
