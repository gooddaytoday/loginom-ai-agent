// Operator acceptance-only replay AFTER native bytes and settings were checked.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('.',import.meta.url));
const graphCode=async page=>page.evaluate(()=>{
 const card=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),d=card.Controller.FController.FDiagram;
 let node=card.Controller.Node.data.node,packagePath=null;const seen=new Set();
 for(let depth=0;node&&depth<32&&!seen.has(node);depth++){seen.add(node);if(node instanceof bg.app.PackageTreeNode){packagePath=node.PackageFileName;break;}node=node.ParentNode;}
 if(!packagePath)throw Error('Native graph package owner missing');
 return {package_path:packagePath,document_id:globalThis.__loginomDockPreparationV1.id,nodes:d.FNodes.FCollection.map(n=>({id:n.FGuid,label:n.FLabel.FRawValue})),links:d.FLinks.FCollection.map(l=>({id:l.FGuid,source:{node:l.FSourcePort.parent.FGuid,port:l.FSourcePort.FGuid,index:l.FSourcePort.FPortIndex},target:{node:l.FTargetPort.parent.FGuid,port:l.FTargetPort.FGuid,index:l.FTargetPort.FPortIndex}}))};
});
export async function reopenCase(ctx) {
 const spec=ctx.readonlyFirst;
 if(!spec?.case||!spec.run_id||ctx.session.metadata.operatorPublicProfile!=='user-v1'||ctx.session.metadata.automaticReadonlyReopen!==true)throw Error('Explicit automatic readonly-first public case required');
 if(ctx.prep.package_ref.path!==spec.package.path)throw Error('Prepared package differs');
 const graph=await ctx.execute(graphCode.toString());
 const graphBeforeRef='browser-'+ctx.browserSequence()+'.json';
 await ctx.fs.writeFile(ctx.dir+'/graph-before.json',JSON.stringify(graph,null,2));
 await ctx.fs.writeFile(ctx.dir+'/readonly-specification.json',JSON.stringify(spec,null,2));
 const checked=spawnSync('python3',[directory+'verify_downloads.py',ctx.dir,ctx.dir+'/readonly-specification.json','--baseline',spec.baseline_package,'--graph',ctx.dir+'/graph-before.json','--output',ctx.dir+'/before-write-verification.json'],{encoding:'utf8'});
 if(checked.status!==0)throw Error('Native pre-write verification failed: '+checked.stderr);
 const verified=JSON.parse(await ctx.fs.readFile(ctx.dir+'/before-write-verification.json','utf8'));
 const snapshot=verified.snapshot;
 if(snapshot.source_path!==spec.source.path||snapshot.source_guid!==spec.source_guid||snapshot.collapse_guid!==spec.collapse_guid)throw Error('Saved source/node identity differs');
 await ctx.fs.writeFile(ctx.dir+'/before-write-gate.json',JSON.stringify({status:'VERIFIED',run_id:spec.run_id,case:spec.case,document_id:ctx.prep.document_id,verification_file:ctx.dir+'/before-write-verification.json'},null,2));
 // A real same-byte upload grants source admission only after the preceding gate.
 const source=ctx.dir+'/readonly-downloads/'+spec.source.path.split('/').at(-1);
 const bytes=await ctx.fs.readFile(source),name=spec.source.path.split('/').at(-1),storage=spec.source.path.slice(0,spec.source.path.lastIndexOf('/'));
 const artifact=await ctx.session.artifactStore.admit({sourcePath:source,name,bytes:bytes.length,sha256:spec.source.sha256,upload:{directory:storage,overwrite:'replace'}});
 await ctx.execute(`async page=>{const tabs=await page.locator('[data-tid^="MF;cntMain;cntWorkspace;Workspace;t.br;tb-"]').evaluateAll(es=>es.filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.textContent.trim().startsWith(${JSON.stringify(storage.split('/').at(-1))}+' ')).map(e=>e.dataset.tid));if(tabs.length!==1)throw Error('Unique existing Files tab required');await page.locator('[data-tid="'+tabs[0]+'"]').click();return await page.evaluate(expected=>{const w=bg.app.Application.FInstance.FMainForm.Items.Workspace,c=w.getActiveTab().Controller.FController;if(c.constructor.name!=='FileStorageForm'||c.FCurrentDirPath!==expected+'/'||w.items.items.filter(x=>x.Controller?.FController?.constructor.name==='FileStorageForm').length!==1)throw Error('Source admission Files owner differs');return true;},${JSON.stringify(storage)});}`);
 const prefix=spec.run_id+':'+spec.case;
 const delivery=await ctx.runtime.deliverArtifact({operation_id:prefix+':source',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:180000});
 await ctx.fs.writeFile(ctx.dir+'/same-byte-admission.json',JSON.stringify({artifact,delivery},null,2));
 if(delivery.outcome?.status!=='SUCCEEDED'||delivery.outcome.destination!==spec.source.path||delivery.outcome.sha256!==spec.source.sha256)throw Error('Same-byte admission not verified');
 const ref=node_id=>({document_id:ctx.prep.document_id,workflow_id:ctx.prep.workflow_ref.workflow_id,node_id});
 const common={contract_revision:'1.0.0',document_id:ctx.prep.document_id,workflow_ref:ctx.prep.workflow_ref,inputs:[],mappings:[],finish:'execute',budgets:{configure_ms:900000,execute_ms:60000,total_ms:1000000}};
 const imported=await ctx.runtime.runNodeApply({...common,operation_id:prefix+':import',target:{kind:'existing',type:'imports.text',ref:ref(snapshot.source_guid)},mode:'delimited',parameters:{source:{artifact_id:artifact.artifact_id,upload_operation_id:delivery.upload_operation_id},settings:{}},read:{ports:[],sample_rows:0,require_exact_numbers:false}});
 await ctx.fs.writeFile(ctx.dir+'/reopened-import.json',JSON.stringify(imported,null,2));if(imported.status!=='SUCCEEDED')throw Error('Saved import replay not completed');
 const collapsed=await ctx.runtime.runNodeApply({...common,operation_id:prefix+':reopen',target:{kind:'existing',type:'transform.collapse_columns',ref:ref(snapshot.collapse_guid)},mode:'unpivot',parameters:{},read:{ports:[0],sample_rows:10,require_exact_numbers:true,coverage:'full'}});
 await ctx.fs.writeFile(ctx.dir+'/reopened-internal.json',JSON.stringify(collapsed,null,2));if(collapsed.status!=='SUCCEEDED')throw Error('Saved Collapse replay not completed');
 const result=await ctx.runtime.readUserNodeResult(prefix+':reopen');await ctx.fs.writeFile(ctx.dir+'/reopened-case.json',JSON.stringify(result,null,2));
 await ctx.fs.writeFile(ctx.dir+'/graph-after.json',JSON.stringify(await ctx.execute(graphCode.toString()),null,2));
 await ctx.fs.writeFile(ctx.dir+'/graph-raw-refs.json',JSON.stringify({before:graphBeforeRef,after:'browser-'+ctx.browserSequence()+'.json'},null,2));
 return {case:spec.case,status:collapsed.status,operation_id:prefix+':reopen',before_write_verified:true};
}
