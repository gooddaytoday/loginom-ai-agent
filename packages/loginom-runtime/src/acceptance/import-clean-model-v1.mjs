import {captureData} from '../retained-capture.mjs';
// Import-only offline model. Tokens never confer host/native Close authority.
// The guarded Close consumer and native completion remain shared-kernel gates.
export function createImportCleanModel({assertCurrent,now=Date.now,deadline}) {
 if(typeof assertCurrent!=='function'||!Number.isSafeInteger(deadline))throw Error('LOGINOM_IMPORT_CLEAN_CONTEXT');
 const tokens=new WeakMap();
 const guard=()=>{assertCurrent();if(now()>=deadline)throw Error('LOGINOM_IMPORT_CLEAN_EXPIRED');};
 return Object.freeze({
  observe(facts,identity){
   guard();captureData(facts);captureData(identity);
   const keys=['session_id','document_id','workflow_id','node_id','account','package_path','tab_tid','loginom_build'];
   const complete=facts?.status==='OBSERVED_CLEAN_CANDIDATE'&&facts.dirty===false&&facts.running===false
    &&facts.dialogs===false&&facts.inventory===1&&facts.native_identity===true&&facts.read_only_observation===true
    &&Number.isSafeInteger(facts.observed_at)&&facts.observed_at<=now()&&facts.observed_at>=identity.read_started_at
    &&keys.every(k=>typeof identity[k]==='string'&&identity[k]&&facts[k]===identity[k]);
   guard();
   if(!complete)return {status:'UNKNOWN',model_clean_verified:false,close_authority:false,native_proof:false,proof:null};
   const proof=Object.freeze(Object.create(null));
   tokens.set(proof,{identity:JSON.stringify(identity),facts:JSON.stringify(facts)});
   return {status:'OFFLINE_MODEL_PROOF',model_clean_verified:true,close_authority:false,native_proof:false,proof};
  },
  inspect(proof,identity){guard();const held=proof&&tokens.get(proof);
   if(!held||held.identity!==JSON.stringify(identity))throw Error('LOGINOM_IMPORT_CLEAN_OPAQUE_REFUSED');
   guard();return {model_clean_verified:true,close_authority:false,native_proof:false,shared_consumer:'NOT_INSTALLED'};
  },
  requestReadonlyClose(proof,identity){this.inspect(proof,identity);throw Error('LOGINOM_IMPORT_GUARDED_CLOSE_SEAM_REQUIRED');}
 });
}

// Serializable fixed read. Only the existing preparation receipt is consulted;
// no private Maps are created and no native mutation/Close/Save is invoked.
export async function readImportCleanFacts(o) {
 const unknown=reason=>({status:'UNKNOWN',reason,dirty:null,native_identity:false,close_authority:false});
 const held=[];
 const own=(object,key)=>{const d=Object.getOwnPropertyDescriptor(object??{},key);
  if(!d||!Object.hasOwn(d,'value'))throw Error('INERT_OWN_NATIVE_FACT_REQUIRED');
  held.push({object,key,value:d.value});return d.value;};
 const unchanged=()=>held.every(({object,key,value})=>{const d=Object.getOwnPropertyDescriptor(object,key);return d&&Object.hasOwn(d,'value')&&d.value===value;});
 try{
  const bg=own(globalThis,'bg'),app=own(bg,'app'),application=own(app,'Application'),instance=own(application,'FInstance'),main=own(instance,'FMainForm');
  const map=own(main,'FMapTree'),connection=own(map,'FServerConnection'),session=own(connection,'Session');
  const p=own(globalThis,'__loginomDockPreparationV1'),doc=own(globalThis,'document');
  if(own(p,'document')!==doc||own(p,'id')!==o.document_id||own(app,'Version')!==o.loginom_build
    ||own(connection,'UserName')!==o.account||own(connection,'Connected')!==true)return unknown('CURRENT_OWNER');
  const inventory=own(map,'PackageNodes'),count=own(inventory,'Count'),items=own(inventory,'Items');
  if(count!==1||typeof items!=='function')return unknown('PACKAGE_INVENTORY');
  const pack=items.call(inventory,0),path=own(pack,'PackageFileName'),nativePackage=own(pack,'Package');
  const normalized=typeof path==='string'?'/'+path.replaceAll('\\','/').replace(/^\/+/, ''):null;
  if(normalized!==o.package_path)return unknown('PACKAGE_PATH');
  const receipts=own(p,'receipts');if(!(receipts instanceof Map))return unknown('PREPARATION_RECEIPTS');
  const entries=[...receipts.values()].filter(r=>{try{return r.phase==='verified'&&JSON.parse(r.request).session===o.session_id&&r.workflowId===o.workflow_id&&r.packageNode===pack&&r.nodeTargetWorkflowNode;}catch{return false;}});
  if(entries.length!==1)return unknown('PREPARATION_AMBIGUOUS');
  const receipt=entries[0],workflow=own(receipt,'nodeTargetWorkflowNode');
  for(const key of ['phase','request','workflowId','packageNode','tab'])own(receipt,key);
  const itemsOwner=own(main,'Items'),workspace=own(itemsOwner,'Workspace'),active=own(workspace,'getActiveTab');
  const card=active.call(workspace),controller=own(card,'Controller'),record=own(controller,'Node'),data=own(record,'data');
  let node=own(data,'node'),found=false;
  const nativeModel=own(node,'FModelNode'),wizard=own(controller,'FController');
  if(own(node,'FGuid')!==o.node_id||!nativeModel||own(wizard,'FModelNode')!==nativeModel)return unknown('CURRENT_IMPORT_NODE');
  for(let i=0;node&&i<32;i++){if(node===workflow)found=true;if(node===pack)break;node=own(node,'ParentNode');}
  if(node!==pack||!found)return unknown('CURRENT_TREE');
  const tab=[...document.querySelectorAll('[data-tid='+JSON.stringify(o.tab_tid)+']')];
  if(tab.length!==1||tab[0]!==receipt.tab||!tab[0].classList.contains('x-tab-active'))return unknown('CURRENT_TAB');
  const runningMap=own(map,'HasRunningNodes'),runningPack=own(pack,'HasRunningNodes'),modified=own(session,'IsPackageModified');
  if(typeof runningMap!=='function'||typeof runningPack!=='function'||typeof modified!=='function')return unknown('NATIVE_ABI');
  if(runningMap.call(map)!==false||runningPack.call(pack)!==false)return unknown('RUNNING_OR_UNKNOWN');
  const dirty=await modified.call(session,nativePackage);
  // Finish all providers before a descriptor-only final binding check.
  const currentPack=items.call(inventory,0),currentCard=active.call(workspace),running=runningMap.call(map),packageRunning=runningPack.call(pack);
  const currentTabs=[...document.querySelectorAll('[data-tid='+JSON.stringify(o.tab_tid)+']')];
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(e=>!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden');
  const requestSession=JSON.parse(receipt.request).session;
  const currentReceipts=[...receipts.values()],activeTab=currentTabs[0]?.classList.contains('x-tab-active');
  if(currentPack!==pack||currentCard!==card
    ||currentTabs.length!==1||currentTabs[0]!==tab[0]||!activeTab
    ||requestSession!==o.session_id||receipt.workflowId!==o.workflow_id||currentReceipts.length!==1||currentReceipts[0]!==receipt||receipt.packageNode!==pack||receipt.nodeTargetWorkflowNode!==workflow
    ||dirty!==false||running!==false||packageRunning!==false||dialogs||!unchanged())return unknown('CLEAN_OR_BINDING_CHANGED');
  return {status:'OBSERVED_CLEAN_CANDIDATE',session_id:o.session_id,document_id:o.document_id,workflow_id:o.workflow_id,node_id:o.node_id,
   account:o.account,package_path:o.package_path,tab_tid:o.tab_tid,loginom_build:o.loginom_build,
   dirty:false,running:false,dialogs:false,inventory:1,native_identity:true,read_only_observation:true,observed_at:Date.now(),close_authority:false};
 }catch{return unknown('NATIVE_FACTS_UNAVAILABLE');}
}
