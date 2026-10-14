import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

const need=(ok,message)=>{if(!ok)throw Error('Calculator port commit: '+message);};
export function verifyCalculatorPortCommit(proof,node) {
 need(proof?.verified===true&&proof.modified===true&&proof.observation==='after_output_port_done'
  &&proof.package_saved===false&&proof.persisted_content_verified===false
  &&['document_id','workflow_id','node_id'].every(k=>proof.node_context?.[k]===node?.[k])
  &&proof.node_context?.verified===true&&proof.node_context.surface==='graph'
  &&proof.node_context.locked===false,'package modification not confirmed');
 return proof;
}
export function makeCalculatorPortCommitCode(binding,origin,build) {
 validatePreparedNodeContext(binding);
 const url=new URL(origin);
 need(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&build==='7.4.2','pinned target required');
 return `async page=>(${readCalculatorPortCommit.toString()})(page,${JSON.stringify(binding)},${JSON.stringify(new URL(origin).origin)},${JSON.stringify(build)},${readPreparedNodeContext.toString()})`;
}
export async function readCalculatorPortCommit(page,binding,origin,build,readNode=readPreparedNodeContext) {
 const before=await readNode(page,binding);
 if(before.verified!==true||before.surface!=='graph'||before.locked!==false)throw Error('Calculator port commit: owned unlocked graph required');
 const state=await page.evaluate(async o=>{
  const need=(ok,message)=>{if(!ok)throw Error('Calculator port commit: '+message);};
  const app=globalThis.bg?.app,prep=globalThis.__loginomDockPreparationV1,owner=globalThis.__loginomStartupV1;
  const m=app?.Application?.FInstance?.FMainForm?.FMapTree;
  const snapshot=()=>{
   need(location.origin===o.origin&&app?.Version===o.build&&prep?.document===document&&prep.id===o.binding.document_id,'document or target changed');
   const records=[...prep.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===o.binding.workflow_ref.workflow_id);
   need(records.length>0&&records.every(r=>r.packageNode===records[0].packageNode),'prepared package changed');
   const pack=records[0].packageNode,connection=m?.FServerConnection;
   need(owner?.document===document&&owner.account===connection?.UserName&&connection?.Connected===true,'account changed');
   need(pack?.ReadOnly===false&&m.PackageNodes.Count===1&&m.PackageNodes.Items(0)===pack
    &&pack.HasRunningNodes()===false&&m.HasRunningNodes()===false,'writable idle package required');
   const path=pack.PackageFileName;
   need(typeof path==='string'&&path.length>0,'package path unavailable');
   return {pack,proxy:pack.Package,connection,session:connection.Session,account:connection.UserName,path,owner};
  };
  const a=snapshot(),modified=await a.session.IsPackageModified(a.proxy),b=snapshot();
  need(Object.keys(a).every(k=>a[k]===b[k]),'package changed during read');
  need(typeof modified==='boolean','modified state unavailable');
  return {account:a.account,package_path:a.path,modified};
 },{binding,origin,build});
 const after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Calculator port commit: node changed during read');
 return {verified:true,...state,observation:'after_output_port_done',node_context:after,
  package_saved:false,persisted_content_verified:false};
}
