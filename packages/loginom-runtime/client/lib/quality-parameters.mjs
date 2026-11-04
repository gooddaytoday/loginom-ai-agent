const need=(v,m)=>{if(!v)throw Error('Quality: '+m);};
export const qualityParametersSchema={type:'object',properties:{},additionalProperties:false,
 description:'profile requires {}. Native default settings only; no thresholds, correction actions, training or saved-model apply parameters. Continuous integer/real and discrete string input fields. Read outputs 0,1,2,3,4.'};
export function validateQualityParameters(p,mode,r){
 need(mode==='profile','only profile mode is supported');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===0,'parameters must be {}');
 if(!r)return;
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&(r.target.kind==='existing'||r.inputs.length===1),'one table input required');
 need(r.mappings.length===0,'profile preserves native input/output mappings; overrides are unsupported');
 need(r.read.ports.every(port=>Number.isInteger(port)&&port>=0&&port<=4),'choose table outputs 0 through 4');
}
export function resolveQualityFields(p,fields){
 resolveQualitySource(p,fields);
 need(fields.every(f=>['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный'
  ||f.type==='string'&&f.data_kind==='Дискретный'),'only continuous integer/real and discrete strings are supported');
 return fields;
}
export function resolveQualitySource(p,fields){
 validateQualityParameters(p,'profile');
 need(Array.isArray(fields)&&fields.length>0&&fields.length<=1000,'complete nonempty input schema required');
 need(new Set(fields.map(f=>f.name?.toLowerCase())).size===fields.length,'unique input names required');
 need(fields.every(f=>typeof f.name==='string'&&f.name&&['integer','real','string'].includes(f.type)),'only integer/real/string source types are supported');
 return fields;
}
