const need=(v,m)=>{if(!v)throw Error('Binning: '+m);};
export function validateBinningParameters(parameters,mode,r){
 need(parameters&&typeof parameters==='object'&&!Array.isArray(parameters),'parameters must be an object');
 need(['internal','apply'].includes(mode),'use internal to train or existing apply to preserve saved intervals');
 if(mode==='apply'){
  need(Object.keys(parameters).length===0,'apply takes parameters:{}; no settings edits or training');
  if(r)need(r.target.kind==='existing'&&r.inputs.length===0&&r.mappings.length===0&&r.finish==='execute','apply requires existing node, inputs:[], mappings:[], finish:execute');
 }else{
  need(Object.keys(parameters).length===1&&parameters.binning,'use parameters.binning');
  const p=parameters.binning;
  need(typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['field','method','size','limits'].includes(k)),'use field, method, size and limits only');
  need(typeof p.field==='string'&&p.field.trim().length>0&&p.field.length<=128,'field must be an exact numeric input name');
  need(['count','width','frequency'].includes(p.method),'method must be count, width or frequency');
  need(Number.isFinite(p.size)&&p.size>0&&(p.method==='width'||Number.isSafeInteger(p.size)),'size must be positive; count/frequency need an integer');
  if(p.method==='frequency')need(p.limits===undefined,'frequency uses row frequencies and ties go to next; omit limits');
  else need(Array.isArray(p.limits)&&p.limits.length===2&&p.limits.every(Number.isFinite)&&p.limits[0]<p.limits[1],'count/width require explicit finite limits [lower,upper], lower<upper');
  if(r){
   need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one table source at input 0 required');
   need(r.mappings.length===0,'mapping overrides and external bins are outside this stage');
  }
 }
 if(r)need(JSON.stringify(r.read.ports)===JSON.stringify(r.finish==='execute'?[0,1]:[]),'execute requires both ordered ports [0,1]; Done/Close use []');
}
export function resolveBinningField(parameters,fields){
 const p=parameters.binning;
 need(Array.isArray(fields)&&fields.length>0&&new Set(fields.map(f=>f.name)).size===fields.length,'complete unique input schema required');
 const field=fields.find(f=>f.name===p.field);
 need(field&&['integer','real'].includes(field.type),'selected field must be observed Integer/Real: '+p.field);
 if(field.type==='integer'&&p.limits)need(p.limits.every(Number.isSafeInteger),'Integer bounds must be safe integers');
 return field;
}
