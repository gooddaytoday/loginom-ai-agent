// createExecutionJournal acknowledges its redacted durable representation.
// Its URL formatter adds '/' to a canonical HTTP origin. Reconcile that one
// representation difference for in-memory proof consumers; never alter the log
// or accept redaction/normalization of source, IDs, diagnostic text or other data.
export function acknowledgeJavascriptCalibrationRecord(event,saved){
 const need=(v)=>{if(!v)throw Error('Calibration journal ACK differs');};
 let visited=0;
 const verify=(before,after,key,depth)=>{
  need(++visited<=100000&&depth<=40);
  if(before===after)return;
  if(key==='origin'&&typeof before==='string'&&after===before+'/'){
   need(URL.canParse(before));
   const url=new URL(before);
   need(['http:','https:'].includes(url.protocol)&&url.origin===before&&url.href===after);return;
  }
  need(before!==null&&after!==null&&typeof before==='object'&&typeof after==='object'
   &&Array.isArray(before)===Array.isArray(after));
  if(Array.isArray(before)){
   need(before.length===after.length&&Object.keys(before).length===Object.keys(after).length);
   before.forEach((value,i)=>{need(Object.hasOwn(after,i));verify(value,after[i],String(i),depth+1);});return;
  }
  const keys=Object.keys(before);
  need(keys.length===Object.keys(after).length&&keys.every(k=>Object.hasOwn(after,k)));
  keys.forEach(k=>verify(before[k],after[k],k,depth+1));
 };
 need(saved&&typeof saved==='object'&&!Array.isArray(saved)&&saved.type!=='redaction_failure');
 // Journal metadata may add top-level fields; each submitted field is mandatory.
 for(const key of Object.keys(event)){
  need(Object.hasOwn(saved,key));verify(event[key],saved[key],key,0);
 }
 // Only return raw-equivalent proof fields after complete verification. Callers'
 // existing exact ACK checks keep their original source/owner representation.
 return {...saved,...event};
}
