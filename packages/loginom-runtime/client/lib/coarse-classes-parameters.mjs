const need=(v,m)=>{if(!v)throw Error('Coarse classes: '+m);};
const keys=['input_field','target_field','event_value','partition','min_class_percent','max_classes','uniformity_percent'];
export function validateCoarseClassesParameters(p,mode,r){
 need(p&&typeof p==='object'&&!Array.isArray(p),'parameters must be an object');
 need(['internal','apply'].includes(mode),'use internal to train or apply to preserve saved classes');
 if(mode==='apply'){
  need(Object.keys(p).length===0,'apply requires parameters:{} without training or settings edits');
  if(r)need(r.target.kind==='existing'&&r.inputs.length===0&&r.mappings.length===0&&r.finish==='execute','apply requires existing node, inputs:[], mappings:[], finish:execute');
 }else{
  need(Object.keys(p).length===1&&p.coarse_classes,'use parameters.coarse_classes');
  const c=p.coarse_classes;
  need(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).length===keys.length&&keys.every(k=>Object.hasOwn(c,k)),'all seven coarse_classes settings are required');
  for(const k of ['input_field','target_field','event_value'])need(typeof c[k]==='string'&&c[k].trim().length>0&&c[k].length<=128,k+' must be an exact nonempty string');
  need(c.input_field!==c.target_field,'input and target must differ');
  need(c.partition==='automatic','only automatic discrete partition is supported');
  need(Number.isFinite(c.min_class_percent)&&c.min_class_percent>=0&&c.min_class_percent<=50,'min_class_percent must be 0..50');
  need(Number.isSafeInteger(c.max_classes)&&c.max_classes>=1&&c.max_classes<=1000,'max_classes must be 1..1000');
  need(Number.isFinite(c.uniformity_percent)&&c.uniformity_percent>=0&&c.uniformity_percent<=100,'uniformity_percent must be 0..100');
  if(r)need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1)&&r.mappings.length===0,'one input 0 required; external inputs and mapping overrides unsupported');
 }
 if(r)need(JSON.stringify(r.read.ports)===JSON.stringify(r.finish==='execute'?[0,1,2]:[]),'execute requires all ordered ports [0,1,2]; Done/Close use []');
}
export function resolveCoarseClassesFields(p,fields){
 const c=p.coarse_classes;
 need(Array.isArray(fields)&&fields.length>0&&new Set(fields.map(f=>f.name)).size===fields.length,'complete unique input schema required');
 for(const k of ['input_field','target_field']){
  const f=fields.find(f=>f.name===c[k]);
  need(f&&f.type==='string'&&(f.data_kind===undefined||f.data_kind==='Дискретный'),k+' must name an observed discrete String field');
 }
 return c;
}
