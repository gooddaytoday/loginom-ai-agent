export const SLIDING_WINDOW_POLICIES=Object.freeze({keep_incomplete:'Оставлять неполные записи',drop_added:'Удалять добавленные неполные записи',drop_all_incomplete:'Удалять все неполные записи'});
const need=(v,m)=>{if(!v)throw Error('Sliding window: '+m);};
export function validateSlidingWindowParameters(p,mode,request){
 need(mode==='lag','use mode lag');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['windows','incomplete_records'].includes(k)),'only windows and incomplete_records are supported; no variable bindings');
 need(request.target.kind!=='new'||Array.isArray(p.windows)&&p.incomplete_records!==undefined,'new node requires windows and incomplete_records');
 need(request.mappings.every(m=>(m.fields??m.changes??[]).every(f=>f.source?.kind==='configured_field'&&(m.direction==='output'||f.excluded!==true))),'mappings require configured fields; input exclusions unsupported');
 if(p.incomplete_records!==undefined)need(Object.hasOwn(SLIDING_WINDOW_POLICIES,p.incomplete_records),'choose keep_incomplete, drop_added or drop_all_incomplete');
 if(p.windows===undefined)return;
 need(Array.isArray(p.windows)&&p.windows.length<=128,'windows must be an array of at most 128 fields');
 const names=new Set();
 for(const w of p.windows){
  need(w&&typeof w==='object'&&Object.keys(w).every(k=>['field','history','horizon'].includes(k))&&typeof w.field==='string'&&w.field.length>0&&w.field.length<=128&&!names.has(w.field),'each window requires a unique exact field name');names.add(w.field);
  for(const k of ['history','horizon'])need(Number.isSafeInteger(w[k])&&w[k]>=0&&w[k]<=134217727,k+' must be an integer 0..134217727');
 }
}
export function resolveSlidingWindowParameters(p,inputs){
 need(Array.isArray(inputs)&&new Set(inputs.map(f=>f.name)).size===inputs.length,'unique input schema required');
 for(const w of p.windows??[])need(inputs.filter(f=>f.name===w.field).length===1,'unknown input field '+w.field);
 const plan=inputs.map(f=>{
  need(['integer','real','string','boolean','datetime'].includes(f.type),'unsupported input type for '+f.name);
  const w=p.windows?.find(w=>w.field===f.name);
  return {...f,history:w?.history??(p.windows===undefined?f.history:0),horizon:w?.horizon??(p.windows===undefined?f.horizon:0)};
 });
 // Check collision ranges without allocating an array proportional to a window.
 for(const f of plan)for(const other of inputs){
  for(const [suffix,count] of [['H',f.history],['F',f.horizon]]){
   const prefix=f.name+'_'+suffix+'_',tail=other.name.slice(prefix.length),n=Number(tail);
   need(!(other.name.startsWith(prefix)&&/^[1-9][0-9]*$/.test(tail)&&n<=count),'generated output collision: '+other.name);
  }
 }
 return plan;
}
export function validateSlidingWindowInputParameters(p,resolved,native){resolveSlidingWindowParameters(p,resolved.fields??native.target_fields);}
