import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writePrivateJson} from '../private-json.mjs';
import {verifyPreparedSourceGraph,verifyPreparedSourceSettings} from '../prepared-source-proof.mjs';

test('private JSON is 0600 under permissive and restrictive umasks; linked outputs refuse',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'source-private-')),original=process.umask();
 try{
  for(const mask of [0o002,0o777]){process.umask(mask);const path=join(directory,'result-'+mask+'.json');await writePrivateJson(path,{status:'FAIL'});assert.equal((await stat(path)).mode&0o777,0o600);assert.deepEqual(JSON.parse(await readFile(path)),{status:'FAIL'});}
  process.umask(original);
  const target=join(directory,'original.json'),link=join(directory,'result.json');await writePrivateJson(target,{untouched:true});await symlink(target,link);
  await assert.rejects(writePrivateJson(link,{untouched:false}),/PRIVATE_OUTPUT_INVALID/);assert.deepEqual(JSON.parse(await readFile(target)),{untouched:true});
 }finally{process.umask(original);await rm(directory,{recursive:true,force:true});}
});
test('existing source must have exactly the owned two-node graph and fixture roles',()=>{
 const fixture={package_basename:'source.lgp',file:{columns:[{name:'Key',label:'Key',type:'string'},{name:'RealValue',label:'RealValue',type:'real'},{name:'TextValue',label:'TextValue',type:'string'}]},collapse:{information:['Key'],transposed:['RealValue','TextValue'],ignore_empty:false}};
 const ref=node_id=>({document_id:'doc',workflow_id:'flow',node_id});
 const prepared={status:'READY',document_id:'doc',workflow_ref:{workflow_id:'flow'},package_ref:{path:'/worker/source.lgp'}};
 const graph={complete:true,document_id:'doc',workflow_ref:prepared.workflow_ref,foreign_links:[],nodes:[{type:'imports.text',label:'VariantInput',ref:ref('input')},{type:'transform.collapse_columns',label:'VariantSource',ref:ref('collapse')}],links:[{source:'input',target:'collapse',input:0,output:0}]};
 const nodes=verifyPreparedSourceGraph(graph,prepared,'worker',fixture);
 for(const mutate of [g=>g.complete=false,g=>g.nodes.push({...g.nodes[0]}),g=>g.nodes[1].type='transform.cross_table',g=>g.nodes[0].label='unknown',g=>g.nodes[0].ref.document_id='foreign',g=>g.links[0].output=1,g=>g.links[0].source='foreign',g=>g.foreign_links.push('foreign')]){const bad=structuredClone(graph);mutate(bad);assert.throws(()=>verifyPreparedSourceGraph(bad,prepared,'worker',fixture));}
 assert.throws(()=>verifyPreparedSourceGraph(graph,prepared,'reviewer',fixture));
 const withSystem=structuredClone(graph);withSystem.nodes.push({type:'bg-vendor-icon-modelvariables',ref:ref('system')});
 verifyPreparedSourceGraph(withSystem,prepared,'worker',fixture,[{node_id:'system',status:0,running:false}]);
 for(const proof of [[],[{node_id:'foreign',status:0,running:false}],[{node_id:'system',status:1,running:false}],[{node_id:'system',status:0,running:true}]])assert.throws(()=>verifyPreparedSourceGraph(withSystem,prepared,'worker',fixture,proof));
 const sources={imports:[{node_id:'input',configuration:{output_mapping:{fields:fixture.file.columns}}}],collapses:[{node_id:'collapse',configuration:{information:[fixture.file.columns[0]],transposed:fixture.file.columns.slice(1),ignore_empty:false}}],crossTables:[]};
 verifyPreparedSourceSettings(sources,nodes,fixture);
 for(const mutate of [s=>s.imports[0].node_id='foreign',s=>s.collapses[0].configuration.ignore_empty=true,s=>s.collapses[0].configuration.transposed.reverse(),s=>s.crossTables.push({}),s=>s.imports[0].configuration.output_mapping.fields[0].type='real']){const bad=structuredClone(sources);mutate(bad);assert.throws(()=>verifyPreparedSourceSettings(bad,nodes,fixture));}
});
