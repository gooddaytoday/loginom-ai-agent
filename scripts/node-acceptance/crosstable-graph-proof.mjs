// Read-only independent graph proof using the candidate's штатный cached graph reader.
import {parseArgs} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const args=parseArgs({options:{resources:{type:'string'},connection:{type:'string'},public:{type:'string'},output:{type:'string'}}}).values;
const root=resolve(args.resources),load=name=>import(join(root,'runtime',name));
const {verifyResources}=await load('src/resources.mjs');const resources=await verifyResources(root);
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {createNodeTargetBrowserAdapter}=await load('client/lib/node-target-browser.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const conn=JSON.parse(await readFile(args.connection,'utf8')),secret=JSON.parse(conn.secrets.payload);
const proof=JSON.parse(await readFile(args.public,'utf8'));
await mkdir(args.output,{recursive:false,mode:0o700});
const sessionId=randomUUID();
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:join(args.output,'browser'),candidate:{url:conn.url,username:conn.username,password:secret.password},headless:false,keepOpen:true});
const execute=code=>new Function('page',`return (${code})(page)`)(context.pages()[0]);
let prepared,cleanup;
try{
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:conn.url,compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'graph-proof',intent:'open_package',packagePath:proof.package_path}));
 assert.equal(prepared.status,'READY');assert.equal(prepared.package_ref.path,proof.package_path);
 const adapter=createNodeTargetBrowserAdapter({execute,origin:new URL(conn.url).origin,build:'7.4.2'});
 const graph=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
 await writeFile(join(args.output,'graph-observation.json'),JSON.stringify(graph,null,2)+'\n');
 assert.equal(graph.complete,true);assert.equal(graph.nodes.length,3);assert.deepEqual(graph.foreign_links,[]);
 // Loginom creates one native scenario-variables node in every new graph.
 // It is not an additional table processor and must have no tabular ports.
 const variables=graph.nodes.filter(node=>node.type==='bg-vendor-icon-modelvariables');
 assert.equal(variables.length,1);assert.deepEqual(variables[0].inputs,[]);assert.deepEqual(variables[0].outputs,[]);
 const importer=graph.nodes.find(node=>node.type==='imports.text'),cross=graph.nodes.find(node=>node.type==='transform.cross_table');
 assert(importer&&cross);assert.equal(importer.ref.node_id,proof.import.node_id);assert.equal(cross.ref.node_id,proof.node.node_id);
 assert.deepEqual(graph.links,[{source:importer.ref.node_id,output:0,target:cross.ref.node_id,input:0}]);
 cleanup=await execute(makePackageCleanupCode({sessionId,documentId:prepared.document_id,account:conn.username,packagePath:proof.package_path,loginomUrl:conn.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true}));
 assert.equal(cleanup.status,'SUCCEEDED');assert(cleanup.package_closed&&cleanup.logged_out);
 await writeFile(join(args.output,'graph-result.json'),JSON.stringify({status:'PASS',package_path:proof.package_path,graph,cleanup},null,2)+'\n');
 console.log('PASS: independent saved graph, original node GUIDs, one import → one CrossTable, port 0 → 0, cleanup true/true');
}finally{
 if(prepared&&!cleanup)await execute(makePackageCleanupCode({sessionId,documentId:prepared.document_id,account:conn.username,packagePath:proof.package_path,loginomUrl:conn.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true})).catch(()=>{});
 await context.close();
}
