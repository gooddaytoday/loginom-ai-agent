// LAB-69 private diagnostic consumer. Resource-authority59 remains the source
// for foreign disposition; this module never derives ownership from names.
export function primaryPresence(owner) {
 return Object.hasOwn(owner,'primaryFailure')
  ? {present:true,is_undefined:owner.primaryFailure===undefined,value:owner.primaryFailure}
  : {present:false,is_undefined:false};
}

export async function readOwnConnection(expected) {
 const reject=reason=>({status:'NOT_VERIFIED',reason,request_id:expected.request_id});
 const bg=globalThis.bg,app=bg?.app,application=app?.Application,instance=application?.FInstance;
 const main=instance?.FMainForm,map=main?.FMapTree;
 const own=globalThis.__loginomStartupV1,connection=map?.FServerConnection,session=connection?.Session;
 const valid=()=>globalThis.__loginomStartupV1===own&&globalThis.bg===bg&&bg?.app===app
  &&app?.Application===application&&application?.FInstance===instance&&instance?.FMainForm===main
  &&document===own?.document&&own?.id===expected.owner_id&&own.account===expected.account
  &&location.origin===expected.origin&&app?.Version===expected.build&&main?.FMapTree===map
  &&map.FServerConnection===connection&&connection.Session===session
  &&connection.Connected===true&&connection.UserName===expected.account;
 if(!valid())return reject('OWN_DOCUMENT_ACCOUNT_CONNECTION');
 if(!map.FPackagesParentNode)return reject('NATIVE_ROOT_UNAVAILABLE');
 if(typeof session?.get_CurrentUser!=='function'||typeof session?.get_Guid!=='function')return reject('SUPPORTED_OWN_SESSION_GETTERS_UNAVAILABLE');
 const started_at=new Date().toISOString(),root=map.FPackagesParentNode,inventory=map.PackageNodes,count=inventory?.Count;
 if(!Number.isSafeInteger(count)||count<0||count>100)return reject('CACHE_COUNT_UNAVAILABLE');
 // No package mutation/dirty getter may be called just because its path matches.
 // Nonempty caches need a prepared receipt/native package chain not supplied by
 // this empty-observer caller. Existing package-persistence owns that read.
 if(count!==0)return reject('PREPARED_PACKAGE_AUTHORITY_REQUIRED');
 // Each awaited native getter yields authority. Rebind the complete live
 // chain and empty cache before touching another RPC or resource getter.
 const authorityReason=()=>{
  if(!valid())return 'OWN_DOCUMENT_ACCOUNT_CONNECTION';
  if(map.FPackagesParentNode!==root||map.PackageNodes!==inventory)return 'RESOURCE_REFERENCES_CHANGED';
  const currentCount=inventory.Count;
  if(!Number.isSafeInteger(currentCount)||currentCount<0||currentCount>100)return 'CACHE_COUNT_UNAVAILABLE';
  if(currentCount!==0)return 'PREPARED_PACKAGE_AUTHORITY_REQUIRED';
  return null;
 };
 const user=await session.get_CurrentUser();
 let refusal=authorityReason();if(refusal)return reject(refusal);
 if(typeof user?.get_Name!=='function')return reject('CURRENT_USER_REFERENCE_CHANGED');
 const name=await user.get_Name();
 refusal=authorityReason();if(refusal)return reject(refusal);
 if(name!==expected.account)return reject('NATIVE_CURRENT_USER_MISMATCH');
 const guid=await session.get_Guid();
 refusal=authorityReason();if(refusal)return reject(refusal);
 if(typeof guid!=='string'||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(guid))return reject('NATIVE_OWN_GUID_UNAVAILABLE');
 const running=map.HasRunningNodes();
 refusal=authorityReason();if(refusal)return reject(refusal);
 if(running!==false)return reject('IDLE_NOT_OBSERVED');
 return {status:'OWN_CONNECTION_IDLE_CACHE_VERIFIED',request_id:expected.request_id,owner_id:expected.owner_id,
  account:name,origin:location.origin,build:app.Version,session_guid:guid,started_at,finished_at:new Date().toISOString(),
  own_reference_chain_verified:true,package_count:0,packages:[],running:{observed:true,value:false},
  holders:{verified:false,reason:'Resource-authority59 exposes no complete holder graph'},
  dirty:{verified:false,reason:'No prepared package/save receipt; no dirty getter invoked'},
  historical_operation:{verified:false,reason:'Original retained inspect handle unavailable'},
  mutation_authorized:false,release_authorized:false,read_only:true};
}

export async function captureOwnResources(page,expected) {
 if(!['request_id','owner_id','account','origin','build'].every(k=>typeof expected[k]==='string'&&expected[k])
  ||expected.build!=='7.4.2')throw Error('Exact private caller identity required');
 return page.evaluate(readOwnConnection,expected);
}

export function verifyOwnResources(receipt,expected,now,maxAgeMs=15000) {
 const refuse=reason=>({status:'NOT_VERIFIED',reason,mutation_authorized:false,release_authorized:false});
 if(receipt?.status!=='OWN_CONNECTION_IDLE_CACHE_VERIFIED')return refuse(receipt?.reason??'NO_SUPPORTED_BINDING');
 if(!['request_id','owner_id','account','origin','build'].every(k=>receipt[k]===expected[k]))return refuse('CALLER_IDENTITY_CHANGED');
 if(typeof receipt.session_guid!=='string'||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(receipt.session_guid)
  ||expected.session_guid!==undefined&&receipt.session_guid!==expected.session_guid)return refuse('SESSION_GUID_CHANGED');
 const start=Date.parse(receipt.started_at),end=Date.parse(receipt.finished_at);
 if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>now||now-start>maxAgeMs)return refuse('STALE_OR_INVALID_TIME');
 if(receipt.own_reference_chain_verified!==true||receipt.package_count!==0||!Array.isArray(receipt.packages)||receipt.packages.length
  ||receipt.running?.observed!==true||receipt.running.value!==false||receipt.read_only!==true)return refuse('RESOURCE_OR_READINESS_UNVERIFIED');
 if(receipt.holders?.verified!==false||receipt.dirty?.verified!==false||receipt.historical_operation?.verified!==false
  ||receipt.mutation_authorized!==false||receipt.release_authorized!==false)return refuse('UNSUPPORTED_AUTHORITY_PROMOTION');
 return {...receipt,status:'LIMITED_OWN_CONNECTION_IDLE_CACHE',mutation_authorized:false,release_authorized:false};
}
