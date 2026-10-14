// Fixed Amount pre-Prepare read. The retained owner supplies the original Page;
// no observer, marker reconstruction or package operation is performed here.
import {assertCaptureOwner} from './retained-capture.mjs';
export async function readAmountOwnPage(o) {
 const started_at=new Date().toISOString();
 const result={version:1,owner_id:o.id,account:o.account,origin:o.origin,started_at,
  status:'NOT_VERIFIED',read_only:true,mutation_authorized:false,release_authorized:false,
  package_provenance:'NOT_VERIFIED',source_provenance:'NOT_VERIFIED',
  holders:'NOT_VERIFIED',historical_pending:'NOT_VERIFIED',dirty:'NOT_VERIFIED'};
 const finish=reason=>({...result,reason,finished_at:new Date().toISOString()});
 const bg=globalThis.bg,app=bg?.app,application=app?.Application,instance=application?.FInstance;
 const main=instance?.FMainForm,map=main?.FMapTree,own=globalThis.__loginomStartupV1;
 const connection=map?.FServerConnection,session=connection?.Session;
 const valid=()=>globalThis.bg===bg&&bg?.app===app&&app?.Application===application
  &&application?.FInstance===instance&&instance?.FMainForm===main&&main?.FMapTree===map
  &&globalThis.__loginomStartupV1===own&&own?.document===document&&own.id===o.id&&own.account===o.account
  &&location.origin===o.origin&&app?.Version==='7.4.2'&&map?.FServerConnection===connection
  &&connection?.Session===session&&connection.Connected===true&&connection.UserName===o.account;
 if(!valid())return finish('ORIGINAL_PAGE_IDENTITY_CHANGED');
 const root=map.FPackagesParentNode,inventory=map.PackageNodes,runningGetter=map.HasRunningNodes;
 const authority=()=>{
  if(!valid())return 'ORIGINAL_PAGE_IDENTITY_CHANGED';
  if(!root||map.FPackagesParentNode!==root||!inventory||map.PackageNodes!==inventory
   ||map.HasRunningNodes!==runningGetter)return 'NATIVE_RESOURCE_REFERENCE_UNAVAILABLE';
  const count=inventory.Count;result.package_count={observed:true,type:typeof count,value:count??null};
  if(!Number.isSafeInteger(count)||count<0)return 'NATIVE_CACHE_COUNT_UNAVAILABLE';
  if(count!==0)return 'ORIGINAL_PREPARED_PACKAGE_REQUIRED';
  return null;
 };
 let reason=authority();if(reason)return finish(reason);
 if(typeof session?.get_CurrentUser!=='function'||typeof session?.get_Guid!=='function'
  ||typeof runningGetter!=='function')return finish('SUPPORTED_NATIVE_GETTER_UNAVAILABLE');
 const user=await session.get_CurrentUser();reason=authority();if(reason)return finish(reason);
 if(typeof user?.get_Name!=='function')return finish('NATIVE_CURRENT_USER_UNAVAILABLE');
 const name=await user.get_Name();reason=authority();if(reason)return finish(reason);
 if(name!==o.account)return finish('NATIVE_ACCOUNT_CHANGED');
 const guid=await session.get_Guid();reason=authority();if(reason)return finish(reason);
 if(typeof guid!=='string'||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(guid))return finish('NATIVE_SESSION_GUID_UNAVAILABLE');
 result.native_session_guid=guid;
 const running=await runningGetter.call(map);reason=authority();if(reason)return finish(reason);
 result.running={observed:true,type:typeof running,value:running??null};
 if(running!==false)return finish('NATIVE_IDLE_NOT_OBSERVED');
 return {...finish(null),status:'OWN_EMPTY_IDLE_PAGE',packages:[],own_reference_chain_verified:true};
}
export async function inspectAmountOwnPage(retained,{guard,record,signal}) {
 const current=()=>{guard();assertCaptureOwner(retained);signal.throwIfAborted();};
 current();const owner=retained.owner,expected={id:owner.id,account:owner.account,origin:owner.origin};
 const receipt=await retained.page.evaluate(readAmountOwnPage,expected);current();
 const now=Date.now(),start=Date.parse(receipt?.started_at),end=Date.parse(receipt?.finished_at);
 if(receipt?.owner_id!==expected.id||receipt.account!==expected.account||receipt.origin!==expected.origin
  ||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>now||now-start>15000)
  throw Error('LOGINOM_AMOUNT_RESOURCE_RECEIPT_CHANGED');
 if(receipt.status==='OWN_EMPTY_IDLE_PAGE' && (receipt.version!==1||receipt.own_reference_chain_verified!==true
  ||receipt.package_count?.observed!==true||receipt.package_count.type!=='number'||receipt.package_count.value!==0
  ||!Array.isArray(receipt.packages)||receipt.packages.length||receipt.running?.observed!==true
  ||receipt.running.type!=='boolean'||receipt.running.value!==false||receipt.read_only!==true
  ||receipt.mutation_authorized!==false||receipt.release_authorized!==false
  ||typeof receipt.native_session_guid!=='string'||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(receipt.native_session_guid)))
  throw Error('LOGINOM_AMOUNT_RESOURCE_RECEIPT_CHANGED');
 // Persist the first refusal as well as successful observations before returning.
 await record({event:'amount_original_page_resources',admission:retained.binding.admission,
  run:retained.binding.run,lease:retained.binding.lease,sdk_session_id:retained.sessionId,
  generation:retained.binding.generation,chat:retained.binding.chat,receipt});current();
 if(receipt.status!=='OWN_EMPTY_IDLE_PAGE')throw Error('LOGINOM_AMOUNT_RESOURCE_READINESS_UNAVAILABLE',{cause:receipt});
 return receipt;
}
