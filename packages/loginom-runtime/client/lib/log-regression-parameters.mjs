const need=(value,message)=>{if(!value)throw Error('Logistic regression: '+message);};
export function validateLogRegressionParameters(parameters,mode,r){
 need(mode==='enter','only binary Enter (enter) is supported; apply is outside this stage');
 need(parameters&&Object.keys(parameters).length===1&&parameters.logistic,'use parameters.logistic');
 const p=parameters.logistic;
 need(typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['input_fields','target_field','event','threshold'].includes(k)),'use input_fields, target_field, event and threshold');
 const name=n=>typeof n==='string'&&n.trim().length>0&&n.length<=128;
 need(Array.isArray(p.input_fields)&&p.input_fields.length>0&&p.input_fields.length<=128&&p.input_fields.every(name),'input_fields must list continuous numeric predictors by technical name');
 need(name(p.target_field),'target_field must name one discrete string response');
 need(name(p.event),'event must be an explicit nonempty category label');
 need(typeof p.threshold==='number'&&Number.isFinite(p.threshold)&&p.threshold>=0&&p.threshold<=1,'threshold is required in 0..1; event if p >= threshold');
 const names=[...p.input_fields,p.target_field];need(new Set(names.map(n=>n.toLowerCase())).size===names.length,'predictors and target must be distinct');
 if(r){
  need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one connected training table is required');
  need(r.mappings.length===0,'mapping overrides, weights and variable bindings are outside this stage');
  need(r.read.ports.every(port=>port===0),'only prediction output 0 is supported; coefficients and summary are outside this stage');
 }
}
export function resolveLogRegressionRoles(parameters,fields){
 validateLogRegressionParameters(parameters,'enter');const p=parameters.logistic;
 need(Array.isArray(fields)&&fields.length>0&&new Set(fields.map(f=>f.name?.toLowerCase())).size===fields.length,'complete unique input schema required');
 for(const name of p.input_fields){const f=fields.find(f=>f.name===name);need(f&&['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный','predictor must be an observed continuous numeric field: '+name);}
 const target=fields.find(f=>f.name===p.target_field);need(target&&target.type==='string'&&target.data_kind==='Дискретный','target must be an observed discrete string field');
 return fields.map(f=>({...f,usage_type:p.input_fields.includes(f.name)?3:f.name===p.target_field?4:0}));
}
