const need=(value,message)=>{if(!value)throw Error('Linear regression: '+message);};
export function validateLinRegressionParameters(p,mode,r){
 need(['enter','apply'].includes(mode),'only Enter (enter) and apply with an intercept and no normalization are supported');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['input_fields','target_field'].includes(k)),'use input_fields and target_field');
 need(Array.isArray(p.input_fields)&&p.input_fields.length>0&&p.input_fields.length<=128&&p.input_fields.every(n=>typeof n==='string'&&n.length>0&&n.length<=128),'input_fields must list continuous numeric predictors by their technical names');
 need(typeof p.target_field==='string'&&p.target_field.length>0&&p.target_field.length<=128,'target_field must name one continuous numeric response');
 const names=[...p.input_fields,p.target_field];need(new Set(names.map(n=>n.toLowerCase())).size===names.length,'predictors must be distinct from each other and from the target');
 if(r){
  if(mode==='apply')need(r.target.kind==='existing'&&r.inputs.length===0&&r.finish==='execute','apply requires an existing trained model, unchanged connections and finish execute');
  need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one connected training table is required');
  need(r.mappings.length===0,'mapping overrides are outside this stage; outputs retain predictions and the coefficient table');
  need(r.read.ports.every(p=>p===0||p===1),'read predictions at output 0 and coefficients at output 1');
 }
}
export function resolveLinRegressionRoles(p,fields){
 validateLinRegressionParameters(p,'enter');
 need(Array.isArray(fields)&&fields.length>0&&new Set(fields.map(f=>f.name?.toLowerCase())).size===fields.length,'complete unique input schema required');
 for(const name of [...p.input_fields,p.target_field]){
  const field=fields.find(f=>f.name===name);
  need(field&&['integer','real'].includes(field.type)&&field.data_kind==='Непрерывный','predictor and target must be observed continuous numeric fields: '+name);
 }
 return fields.map(f=>({...f,usage_type:p.input_fields.includes(f.name)?3:f.name===p.target_field?4:0}));
}
