const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const source=f=>f.source??f.exclusion_source;
const retained=f=>Object.fromEntries(Object.entries(f).filter(([k])=>!['record_id','field_id','index'].includes(k)));
export function verifyCalculatorInlineSync(before,after,missing) {
 if(!same(before.source_fields,after.source_fields)||before.autosync!==after.autosync
  ||after.target_fields.length!==before.target_fields.length+missing.length)throw Error('Calculator inline synchronization changed its source or inventory');
 const old=before.target_fields.map(f=>source(f)?.record_id);
 if(old.some(id=>!id)||new Set(old).size!==old.length)throw Error('Calculator inline mapping has an unbound field');
 for(const f of before.target_fields) {
  const matches=after.target_fields.filter(g=>source(g)?.record_id===source(f).record_id);
  if(matches.length!==1||!same(retained(f),retained(matches[0]))||!f.excluded&&f.field_id!==matches[0].field_id)
   throw Error('Calculator inline synchronization changed a retained field');
 }
 const additions=after.target_fields.filter(f=>!old.includes(source(f)?.record_id));
 if(additions.length!==missing.length||additions.some(f=>{
  const s=missing.find(s=>s.record_id===f.source?.record_id);
  return !s||f.excluded!==false||f.name!==s.name||f.label!==s.label||f.type!==s.type||!same(f.source,s);
 }))throw Error('Calculator inline synchronization did not add exactly the requested fields');
 const retainedOrder=after.target_fields.filter(f=>old.includes(source(f)?.record_id)).map(f=>source(f).record_id);
 if(!same(old,retainedOrder))throw Error('Calculator inline synchronization reordered retained fields');
 return true;
}
