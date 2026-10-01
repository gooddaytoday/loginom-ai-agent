const requireValue=(value,message)=>{if(!value)throw Error(message);};
const object=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const fieldName=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[\x00-\x1f]/.test(value);
export const DATAPARTITION_MODES=Object.freeze(['random','uniform','stratified','sequential','biased']);
const methodKeys=Object.freeze({random:[],uniform:['training','test'],stratified:['fields','complete_unique_values'],sequential:['order'],biased:['field','adjustments']});
const commonKeys=['training','test','priority','test_position','seed'];

export function validateDataPartitionParameters(parameters,mode,request){
 requireValue(DATAPARTITION_MODES.includes(mode),'Unknown DataPartition mode');
 requireValue(object(parameters,[...commonKeys,...DATAPARTITION_MODES.filter(value=>value!=='random')]),'Invalid DataPartition parameters');
 const newNode=request.target.kind==='new';
 requireValue(!newNode||commonKeys.every(key=>Object.hasOwn(parameters,key)),'New DataPartition requires explicit sizes, priority, position and seed');
 for(const key of ['training','test'])if(Object.hasOwn(parameters,key)){
  const size=parameters[key];
  requireValue(object(size,['unit','value'])&&['rows','percent'].includes(size.unit),'Size requires rows or percent and value');
  requireValue(size.unit==='rows'?Number.isSafeInteger(size.value)&&size.value>=0:Number.isFinite(size.value)&&size.value>=0&&size.value<=100,'Invalid DataPartition size');
 }
 if(Object.hasOwn(parameters,'priority'))requireValue(['training','test'].includes(parameters.priority),'Invalid DataPartition priority');
 if(Object.hasOwn(parameters,'test_position'))requireValue(['algorithm','start','end'].includes(parameters.test_position),'Invalid priority test position');
 if(parameters.priority==='training'&&Object.hasOwn(parameters,'test_position'))requireValue(parameters.test_position==='algorithm','Start/end position requires test priority');
 if(Object.hasOwn(parameters,'seed')){
  const seed=parameters.seed;
  requireValue(object(seed,['policy','value'])&&['fixed','always_random'].includes(seed.policy),'Invalid DataPartition seed policy');
  requireValue(seed.policy==='fixed'?Number.isSafeInteger(seed.value)&&seed.value>0:!Object.hasOwn(seed,'value'),'Fixed seed must be a positive integer; always_random omits value');
 }
 for(const method of DATAPARTITION_MODES.filter(value=>value!=='random')){
  requireValue(method===mode||!Object.hasOwn(parameters,method),'Inactive DataPartition method block is not accepted');
  if(method!==mode)continue;
  requireValue(!newNode||Object.hasOwn(parameters,method),'New DataPartition requires complete method settings');
  if(!Object.hasOwn(parameters,method))continue;
  const settings=parameters[method];
  requireValue(object(settings,methodKeys[method])&&methodKeys[method].every(key=>Object.hasOwn(settings,key)),'Complete DataPartition method block required');
  if(method==='uniform')for(const role of ['training','test']){
   const size=settings[role];
   requireValue(object(size,['unit','value'])&&['rows','percent'].includes(size.unit)&&(size.unit==='rows'?Number.isSafeInteger(size.value)&&size.value>0:Number.isFinite(size.value)&&size.value>0&&size.value<=100),'Positive native group size required');
  }
  if(method==='sequential')requireValue(Array.isArray(settings.order)&&settings.order.length===3&&['training','test','unused'].every(role=>settings.order.includes(role)),'Exact permutation of training/test/unused required');
  if(method==='stratified')requireValue(Array.isArray(settings.fields)&&settings.fields.length>0&&settings.fields.every(fieldName)&&new Set(settings.fields).size===settings.fields.length,'Unique exact stratum field names required');
  if(method==='stratified')requireValue(typeof settings.complete_unique_values==='boolean','Explicit complete_unique_values required');
  if(method==='biased'){
   requireValue(fieldName(settings.field)&&Array.isArray(settings.adjustments)&&settings.adjustments.length>0,'Bias field and nonempty adjustments required');
   const identities=settings.adjustments.map(adjustment=>{
    requireValue(object(adjustment,['value','factor','count'])&&Object.hasOwn(adjustment,'factor')!==Object.hasOwn(adjustment,'count'),'Bias adjustment requires exactly one factor or count');
    requireValue(Object.hasOwn(adjustment,'count')?Number.isSafeInteger(adjustment.count)&&adjustment.count>=0:Number.isFinite(adjustment.factor)&&adjustment.factor>=0,'Bias factor/count must be nonnegative');
    return dataPartitionValueIdentity(adjustment.value);
   });
   requireValue(new Set(identities).size===identities.length,'Duplicate typed bias value');
  }
 }
 requireValue(request.inputs.length<=1&&request.inputs.every(input=>input.input===0),'DataPartition accepts one table input');
 requireValue(!newNode||request.inputs.length===1,'New DataPartition requires explicit linked input');
 requireValue(request.finish==='execute'?request.read.ports.length===3&&[0,1,2].every(port=>request.read.ports.includes(port)):request.read.ports.length===0,'Execute must read all three DataPartition outputs');
 requireValue(request.mappings.every(mapping=>mapping.direction==='input'?mapping.port===0:mapping.direction==='output'&&[0,1,2].includes(mapping.port)),'Invalid DataPartition mapping port');
 requireValue(request.finish!=='close'||request.mappings.every(mapping=>mapping.direction!=='input'),'Close cannot commit separate input mappings');
 return parameters;
}

export function resolveDataPartitionParameters(parameters,mode,observed,{newNode=false}={}){
 requireValue(newNode||observed?.verified===true&&DATAPARTITION_MODES.includes(observed.mode),'Verified DataPartition settings required for patch');
 const changedMode=!newNode&&observed.mode!==mode;
 requireValue(!changedMode||mode==='random'||Object.hasOwn(parameters,mode),'Changing DataPartition mode requires its complete settings');
 const baseline=newNode?{}:structuredClone(observed.parameters);
 requireValue(newNode||object(baseline,[...commonKeys,...DATAPARTITION_MODES.filter(value=>value!=='random')])&&commonKeys.every(key=>Object.hasOwn(baseline,key)),'Complete observed DataPartition settings required');
 const resolved={...baseline,...structuredClone(parameters)};
 if(!newNode&&resolved.priority==='training')resolved.test_position=baseline.test_position;
 DATAPARTITION_MODES.filter(value=>value!=='random'&&value!==mode).forEach(method=>delete resolved[method]);
 requireValue(mode==='random'||Object.hasOwn(resolved,mode),'Resolved DataPartition method settings required');
 requireValue(resolved.priority==='test'||!Object.hasOwn(parameters,'test_position')||parameters.test_position==='algorithm','Start/end position requires test priority');
 return resolved;
}

export function validateDataPartitionInputParameters(parameters,resolved,native,{preview=false}={}){
 const fields=resolved.fields??native.target_fields;
 requireValue(Array.isArray(fields)&&fields.every(field=>fieldName(field.name))&&new Set(fields.map(field=>field.name)).size===fields.length,'Complete unique DataPartition input schema required');
 const names=parameters.stratified?.fields??(parameters.biased?[parameters.biased.field]:[]);
 names.forEach(name=>requireValue(fields.filter(field=>field.name===name).length===1,'DataPartition input field missing: '+name));
 if(parameters.biased){
  const source=fields.find(field=>field.name===parameters.biased.field);
  // The upstream preview proves names/types only. Data kind remains mandatory
  // on the owned native input mapping before its settings are committed.
  if(!preview)requireValue(source.data_kind==='Дискретный','Bias field must be discrete in Loginom');
  parameters.biased.adjustments.forEach(adjustment=>requireValue(adjustment.value.type===source.type,'Bias key type must match its input field'));
 }
}

export function dataPartitionValueIdentity(value){
 requireValue(object(value,['type','is_null','value'])&&['integer','real','boolean','string','datetime'].includes(value.type)&&typeof value.is_null==='boolean'&&Object.hasOwn(value,'value'),'Explicit typed bias value required');
 if(value.is_null){requireValue(value.value===null,'Typed NULL requires null value');return JSON.stringify([value.type,null]);}
 requireValue(value.value!==null,'Non-NULL bias key requires value');
 if(value.type==='integer'){
  requireValue(typeof value.value==='string'&&/^-?(?:0|[1-9][0-9]*)$/.test(value.value),'Integer bias key uses exact decimal string');
  const integer=BigInt(value.value);
  requireValue(integer>=-9223372036854775808n&&integer<=9223372036854775807n,'Integer bias key outside int64');
  return JSON.stringify([value.type,integer.toString()]);
 }
 if(value.type==='real')requireValue(Number.isFinite(value.value),'Finite real bias key required');
 if(value.type==='boolean')requireValue(typeof value.value==='boolean','Boolean bias key required');
 if(value.type==='string')requireValue(typeof value.value==='string','String bias key required');
 if(value.type==='datetime'){
  requireValue(typeof value.value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?$/.test(value.value),'Local ISO datetime bias key required');
  const date=new Date(value.value+'Z');
  requireValue(Number.isFinite(date.getTime())&&date.toISOString().slice(0,23)===value.value.padEnd(23,'.000'),'Valid calendar datetime bias key required');
  return JSON.stringify([value.type,date.toISOString().slice(0,23)]);
 }
 return JSON.stringify([value.type,value.value]);
}
