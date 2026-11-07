const need=(value,message)=>{if(!value)throw Error('Linear regression: '+message);};
export function validateLinRegressionParameters(p,mode,r){
 need(['enter','apply','forward'].includes(mode),'only Enter (enter), Forward (forward) and apply with an intercept and no normalization are supported');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['input_fields','target_field','linear_regression'].includes(k)),'use input_fields and target_field');
 need(Array.isArray(p.input_fields)&&p.input_fields.length>0&&p.input_fields.length<=128&&p.input_fields.every(n=>typeof n==='string'&&n.length>0&&n.length<=128),'input_fields must list continuous numeric predictors by their technical names');
 need(typeof p.target_field==='string'&&p.target_field.length>0&&p.target_field.length<=128,'target_field must name one continuous numeric response');
 if(p.linear_regression!==undefined){
  const settings=p.linear_regression;
  need(mode==='forward'&&settings&&typeof settings==='object'&&!Array.isArray(settings)&&Object.keys(settings).every(k=>k==='selection'),'linear_regression.selection is supported only in forward');
  const selection=settings.selection;
  if(selection!==undefined){
   need(selection&&typeof selection==='object'&&!Array.isArray(selection)&&Object.keys(selection).every(k=>['criterion','add_significance','remove_significance'].includes(k)),'invalid selection settings');
   need(selection.criterion!=='r2','R² пока недоступен: критерий не прошёл native-приёмку. Запрос отклонён до изменений Loginom.');
   need(['f','r2','adjusted_r2','aic','aicc','bic','hqc'].includes(selection.criterion),'unknown selection criterion');
   for(const key of ['add_significance','remove_significance'])if(selection[key]!==undefined)need(selection.criterion==='f'&&Number.isFinite(selection[key])&&selection[key]>0&&selection[key]<1,'invalid or inapplicable '+key);
  }
 }
 const names=[...p.input_fields,p.target_field];need(new Set(names.map(n=>n.toLowerCase())).size===names.length,'predictors must be distinct from each other and from the target');
 if(r){
  if(mode==='apply')need(r.target.kind==='existing'&&r.inputs.length===0&&r.finish==='execute','apply requires an existing trained model, unchanged connections and finish execute');
  need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one connected training table is required');
  need(r.mappings.length===0,'mapping overrides are outside this stage; outputs retain predictions and the coefficient table');
  need(r.read.ports.every(p=>p===0||p===1),'read predictions at output 0 and coefficients at output 1');
 }
}
export function resolveLinRegressionRoles(p,fields){
 const {linear_regression,...roles}=p;validateLinRegressionParameters(roles,'enter');
 need(Array.isArray(fields)&&fields.length>0&&new Set(fields.map(f=>f.name?.toLowerCase())).size===fields.length,'complete unique input schema required');
 for(const name of [...p.input_fields,p.target_field]){
  const field=fields.find(f=>f.name===name);
  need(field&&['integer','real'].includes(field.type)&&field.data_kind==='Непрерывный','predictor and target must be observed continuous numeric fields: '+name);
 }
 return fields.map(f=>({...f,usage_type:p.input_fields.includes(f.name)?3:f.name===p.target_field?4:0}));
}
