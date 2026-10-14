import {fpRejection} from './field-parameters-preservation-v1.mjs';
import {readPreparedNodeContext} from '../../client/lib/node-context.mjs';
// Fixed private bounded read, not a caller script or native success oracle.
export async function readFieldParametersNativeContext(page, options){
 const context=await readPreparedNodeContext(page,options.prepared);
 if(context?.verified!==true||context.surface!=='wizard'||context.node_id!==options.prepared.node.node_id)throw Error('LOGINOM_FP_NATIVE_CONTEXT_UNKNOWN');
 const result=await page.evaluate(async o=>{
  const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
  if(location.origin!==o.origin||app?.Version!==o.loginomBuild||o.loginomBuild!=='7.4.2'||p?.document!==document||p.id!==o.prepared.document_id||m?.FServerConnection?.Connected!==true||m.FServerConnection.UserName!==o.account)throw Error('LOGINOM_FP_NATIVE_IDENTITY_UNKNOWN');
  const records=[];let visited=0;for(const r of p.receipts.values()){if(++visited>128)throw Error('LOGINOM_FP_NATIVE_COVERAGE_UNKNOWN');if(r.phase==='verified'&&r.workflowId===o.prepared.workflow_ref.workflow_id)records.push(r);}
  if(!records.length||records.length>128||records.some(r=>r.packageNode!==records[0].packageNode||r.tab!==records[0].tab))throw Error('LOGINOM_FP_NATIVE_OWNER_UNKNOWN');
  const node=records[0].packageNode;
  if(!node||node.PackageFileName!==o.packagePath||node.ReadOnly!==false||typeof node.HasRunningNodes!=='function'||typeof m.HasRunningNodes!=='function'||typeof m.FServerConnection.Session?.IsPackageModified!=='function')throw Error('LOGINOM_FP_NATIVE_RESOURCES_UNKNOWN');
  const pkg=node.Package;if(!pkg)throw Error('LOGINOM_FP_NATIVE_PACKAGE_UNKNOWN');
  const running=node.HasRunningNodes(),globalRunning=m.HasRunningNodes();
  const modified=await m.FServerConnection.Session.IsPackageModified(pkg);
  if(node.Package!==pkg||m.FServerConnection.Connected!==true||p.document!==document||m.FServerConnection.UserName!==o.account||node.PackageFileName!==o.packagePath||node.ReadOnly!==false||modified!==false||running!==false||globalRunning!==false||node.HasRunningNodes()!==false||m.HasRunningNodes()!==false)throw Error('LOGINOM_FP_NATIVE_RESOURCES_REFUSED');
  return {observed_at:Date.now(),dirty:modified,running:false,account:o.account,package_path:o.packagePath,document_id:p.id,workflow_id:o.prepared.workflow_ref.workflow_id,node_id:o.prepared.node.node_id};
 },options);
 const after=await readPreparedNodeContext(page,options.prepared);if(JSON.stringify(after)!==JSON.stringify(context))throw Error('LOGINOM_FP_NATIVE_CONTEXT_CHANGED');
 return result;
}
export function makeFieldParametersNativeContextCode(options){return `async page=>{const readPreparedNodeContext=${readPreparedNodeContext.toString()};const fpRejection=${fpRejection.toString()};const base={action_key:'acceptance.fp.context',action_revision:'1',operation_id:${JSON.stringify(options.operationId)},phase:'read',effect_possible:false,trace:[]};try{return {...base,status:'SUCCEEDED',cleanup_complete:true,error:null,output:await (${readFieldParametersNativeContext.toString()})(page,${JSON.stringify(options)})};}catch(rejected){return {...base,status:'FAILED',cleanup_complete:false,error:{code:'FP_NATIVE_READ_REFUSED',message:'FP native resource read refused'},output:{rejection:fpRejection(rejected)}};}}`;}
