// Only a newly created draft receipt on the original retained Page can enter Save As.
export async function readAmountDraftPage(o) {
 const need=(v)=>{if(!v)throw Error('LOGINOM_AMOUNT_ORIGINAL_DRAFT_CHANGED')};
 const bg=globalThis.bg,app=bg?.app,application=app?.Application,instance=application?.FInstance;
 const main=instance?.FMainForm,map=main?.FMapTree,connection=map?.FServerConnection,session=connection?.Session;
 const own=globalThis.__loginomStartupV1,prep=globalThis.__loginomDockPreparationV1;
 const receipt=prep?.receipts?.get(o.operation),inventory=map?.PackageNodes,root=map?.FPackagesParentNode;
 const card=main?.Items?.Workspace?.getActiveTab(),pack=receipt?.packageNode,proxy=pack?.Package;
 const oTab=receipt?.tab;
 const running=pack?.HasRunningNodes,modified=session?.IsPackageModified;
 const current=()=>{
  need(globalThis.bg===bg&&bg.app===app&&app.Application===application&&application.FInstance===instance&&instance.FMainForm===main&&main.FMapTree===map);
  need(globalThis.__loginomStartupV1===own&&own.document===document&&own.id===o.owner&&own.account===o.account
   &&location.origin===o.origin&&app.Version==='7.4.2'&&map.FServerConnection===connection&&connection.Session===session
   &&connection.Connected===true&&connection.UserName===o.account);
  need(globalThis.__loginomDockPreparationV1===prep&&prep.document===document&&prep.id===o.document
   &&prep.receipts.get(o.operation)===receipt&&receipt.phase==='verified'&&receipt.workflowId===o.workflow);
  const request=JSON.parse(receipt.request);
  need(request.session===o.session&&request.intent==='new_draft'&&request.packagePath===null);
  let node=card?.Controller?.Node?.data?.node,activePackage;const seen=new Set();
  for(let i=0;node&&i<32&&!seen.has(node);i++,node=node.ParentNode){seen.add(node);if(node instanceof app.PackageTreeNode){activePackage=node;break;}}
  need(activePackage===pack);
  need(main.Items.Workspace.getActiveTab()===card&&receipt.tab===oTab&&oTab?.isConnected===true&&oTab.classList.contains('x-tab-active')&&oTab.getAttribute('data-tid')===o.tab
   &&receipt.packageNode===pack&&pack instanceof app.PackageTreeNode&&pack.Package===proxy&&pack.ReadOnly===false
   &&(pack.PackageFileName===null||pack.PackageFileName===undefined||pack.PackageFileName===''));
  need(map.FPackagesParentNode===root&&root&&map.PackageNodes===inventory&&inventory.Count===1&&inventory.Items(0)===pack
   &&pack.HasRunningNodes===running&&session.IsPackageModified===modified&&typeof running==='function'&&typeof modified==='function');
 };
 current();const executing=await running.call(pack);current();need(executing===false);
 const dirty=await modified.call(session,proxy);current();need(typeof dirty==='boolean');
 return {version:1,original_draft_verified:true,owner:o.owner,document:o.document,session:o.session,
  operation:o.operation,workflow:o.workflow,tab:o.tab,account:o.account,modified:dirty,read_only:true,
  persisted_content_verified:false,mutation_authorized:false,release_authorized:false};
}
