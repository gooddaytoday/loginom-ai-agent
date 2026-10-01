const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const choice=(...values)=>({type:'string',enum:values});
const names={type:'string',minLength:1,maxLength:128};
const size={oneOf:[object({unit:{const:'rows'},value:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}}),object({unit:{const:'percent'},value:{type:'number',minimum:0,maximum:100}})]};
const groupSize={oneOf:[object({unit:{const:'rows'},value:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}}),object({unit:{const:'percent'},value:{type:'number',exclusiveMinimum:0,maximum:100}})]};
const typedValue={oneOf:[
 object({type:choice('integer','real','boolean','string','datetime'),is_null:{const:true},value:{type:'null'}}),
 ...['integer','real','boolean','string','datetime'].map(type=>object({type:{const:type},is_null:{const:false},value:type==='integer'?{type:'string',pattern:'^-?(?:0|[1-9][0-9]*)$'}:type==='real'?{type:'number'}:type==='boolean'?{type:'boolean'}:{type:'string'}})),
]};
export const dataPartitionParametersSchema={...object({
 training:size,test:size,priority:choice('training','test'),test_position:choice('algorithm','start','end'),
 seed:{oneOf:[object({policy:{const:'fixed'},value:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}}),object({policy:{const:'always_random'}})]},
 uniform:object({training:groupSize,test:groupSize}),
 stratified:object({fields:{type:'array',items:names,minItems:1,maxItems:1000,uniqueItems:true},complete_unique_values:{type:'boolean'}}),
 sequential:object({order:{type:'array',items:choice('training','test','unused'),minItems:3,maxItems:3,uniqueItems:true}}),
 biased:object({field:names,adjustments:{type:'array',minItems:1,maxItems:1000,items:{oneOf:[object({value:typedValue,factor:{type:'number',minimum:0}}),object({value:typedValue,count:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}})]}}}),
},[]),description:'Loginom DataPartition: random, uniform, stratified, sequential or biased. New nodes require explicit training/test sizes, priority, test_position, seed and the active method block. Existing patches preserve omitted settings; changing method requires its complete block. Uniform has separate training/test group sizes. Sequential sets the native order of training/test/unused partitions. Execute reads all three outputs: combined, training, test. Integer bias keys use decimal strings; NULL keys retain their source type.'};
