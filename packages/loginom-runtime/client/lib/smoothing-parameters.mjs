const need=(v,m)=>{if(!v)throw Error('Smoothing: '+m);};
export function validateSmoothingParameters(p,mode,request){
 need(mode==='hodrick_prescott','use mode hodrick_prescott');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='smoothing'),'only smoothing rules supported; no variable bindings');
 need(request.target.kind!=='new'||Array.isArray(p.smoothing),'new node requires smoothing');
 need(request.mappings.every(m=>(m.fields??m.changes??[]).every(f=>f.source?.kind==='configured_field'&&(m.direction==='output'||f.excluded!==true))),'mappings require configured fields; input exclusions unsupported');
 if(p.smoothing===undefined)return;
 need(Array.isArray(p.smoothing)&&p.smoothing.length<=128,'smoothing must contain at most 128 rules');
 const names=new Set();
 for(const rule of p.smoothing){
  need(rule&&typeof rule==='object'&&!Array.isArray(rule)&&Object.keys(rule).every(k=>['field','lambda','period'].includes(k))&&typeof rule.field==='string'&&rule.field.length>0&&rule.field.length<=128&&!names.has(rule.field),'unique exact field names required');names.add(rule.field);
  need(Object.hasOwn(rule,'lambda')!==Object.hasOwn(rule,'period'),'each rule requires lambda OR period');
  const key=Object.hasOwn(rule,'lambda')?'lambda':'period',value=rule[key];
  need(Number.isFinite(value)&&value>=(key==='lambda'?0.0625:2)&&value<=(key==='lambda'?102659800000000:20000),'invalid '+key+' range');
 }
}
export function resolveSmoothingParameters(p,inputs){
 need(Array.isArray(inputs)&&new Set(inputs.map(f=>f.name)).size===inputs.length,'unique input schema required');
 for(const rule of p.smoothing??[]){
  const field=inputs.find(f=>f.name===rule.field);need(field,'unknown field '+rule.field);
  need(['integer','real'].includes(field.type)&&field.data_kind==='Непрерывный','continuous integer/real field required: '+rule.field);
  need(!inputs.some(f=>f.name.toLowerCase()===(rule.field+'_S').toLowerCase()),'generated output collision: '+rule.field+'_S');
 }
 return inputs.map(f=>{
  if(p.smoothing===undefined)return {...f};
  const rule=p.smoothing.find(r=>r.field===f.name);
  return {...f,used:!!rule,...(rule?{strength:rule.lambda===undefined?'period':'lambda',requested:rule.lambda??rule.period}: {})};
 });
}
export function validateSmoothingInputParameters(p,resolved,native){resolveSmoothingParameters(p,resolved.fields??native.target_fields);}
