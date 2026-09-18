// Read-only follow-up to a confirmed save. Never alters the save receipt or
// discards changes; a reopened package can already be dirty in Loginom.
export function makeSavedPackageStateCode(options) {
 const {sessionId,documentId,account,packagePath,loginomUrl,loginomBuild}=options;
 if(![sessionId,documentId,account].every(v=>typeof v==='string'&&v.length>0&&v.length<=200)
  ||loginomBuild!=='7.4.2'||typeof packagePath!=='string'||!/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(packagePath)
  ||packagePath.split('/').some(p=>p==='.'||p==='..'))throw Error('Exact saved package identity required');
 const url=new URL(loginomUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid saved package origin');
 return `async page=>page.evaluate(${readSavedPackageState.toString()},${JSON.stringify({sessionId,documentId,account,packagePath,origin:url.origin,loginomBuild})})`;
}
function readSavedPackageState(o) {
 return (async()=>{
  const app=globalThis.bg?.app,f=app?.Application?.FInstance?.FMainForm,m=f?.FMapTree,prep=globalThis.__loginomDockPreparationV1;
  const need=(v,message)=>{if(!v)throw Error(message);};
  need(location.origin===o.origin&&app?.Version===o.loginomBuild&&prep?.document===document&&prep.id===o.documentId,'Saved package document changed');
  need(prep.receipts instanceof Map&&[...prep.receipts.values()].some(r=>{try{return JSON.parse(r.request).session===o.sessionId;}catch{return false;}}),'Saved package session changed');
  const normalize=p=>typeof p==='string'&&p?'/'+p.replaceAll('\\','/').replace(/^\/+/, ''):null;
  const snapshot=()=>{
   need(m?.FServerConnection?.Connected===true&&m.FServerConnection.UserName===o.account,'Saved package account changed');
   const card=f.Items.Workspace.getActiveTab();let n=card?.Controller?.Node?.data?.node,pack;const seen=new Set();
   for(let i=0;n&&i<32&&!seen.has(n);i++,n=n.ParentNode){seen.add(n);if(n instanceof app.PackageTreeNode){pack=n;break;}}
   need(pack&&normalize(pack.PackageFileName)===o.packagePath&&pack.ReadOnly===false,'Active saved package changed');
   const matches=Array.from({length:m.PackageNodes.Count},(_,i)=>m.PackageNodes.Items(i)).filter(p=>p===pack);
   need(matches.length===1&&pack.HasRunningNodes()===false,'Saved package inventory or execution changed');
   return {card,pack,proxy:pack.Package,connection:m.FServerConnection,session:m.FServerConnection.Session,count:m.PackageNodes.Count};
  };
  const before=snapshot();
  const modified=await before.session.IsPackageModified(before.proxy);
  const after=snapshot();need(Object.keys(before).every(k=>before[k]===after[k]),'Saved package changed during read');
  need(typeof modified==='boolean','Saved package modified state unavailable');
  return {version:1,session_id:o.sessionId,document_id:o.documentId,account:o.account,package_path:o.packagePath,
   modified,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
 })();
}
export function parseSavedPackageState(response,expected) {
 if(response?.isError)throw Error('Saved package state read failed');
 for(const block of response?.content??[]){
  if(block.type!=='text')continue;let v;try{v=JSON.parse(block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??block.text);}catch{continue;}
  if(v?.version===1&&v.session_id===expected.sessionId&&v.document_id===expected.documentId&&v.account===expected.account
   &&v.package_path===expected.packagePath&&typeof v.modified==='boolean'&&v.observation==='after_confirmed_save'
   &&v.read_only===true&&v.persisted_content_verified===false)return v;
 }
 throw Error('Bound saved package state missing');
}
export function savedPackageStateAdvice(state,outcome) {
 const path=outcome.output?.package_ref?.path;
 if(outcome.status!=='SUCCEEDED'||!['package.save_as','package.save_checkpoint'].includes(outcome.action_key)
  ||state.package_path!==path||typeof state.modified!=='boolean')throw Error('Confirmed matching save required');
 return {kind:'dock_saved_package_state',save_operation_id:outcome.operation_id,package_path:path,modified:state.modified,
  persisted_content_verified:false,
  ...(state.modified?{next_step:{tool:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path,conflict_policy:'replace'}},
   instruction:'Loginom reports unsaved changes after this completed save/reopen. Before finishing, save this same owned package using the checkpoint operation with a NEW operation_id. Do not discard the changes or repeat save_as. This read does not audit persisted calculations.'}}:{})};
}
