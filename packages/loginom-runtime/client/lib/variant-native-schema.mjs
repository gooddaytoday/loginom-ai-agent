const str={type:'string'},integer={type:'integer',minimum:0},fixed=value=>({const:value});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const bytes={type:'string',pattern:'^[a-f0-9]{16}$'},decimal={type:'string',pattern:'^-?(?:0|[1-9][0-9]*)$'};
const scalar=(cell_type,tag,representation,value,native={},extra={})=>obj({
 type:{type:'string',enum:cell_type==='null'?['variant','integer','real','string','boolean','datetime']:['variant',cell_type]},
 cell_type:fixed(cell_type),is_null:fixed(cell_type==='null'),precision:fixed('exact_native'),representation:fixed(representation),value,
 native:obj({tag:fixed(tag),...native}),...extra,
});
export const nativeCellSchema={anyOf:[
 scalar('null',1,'native_null',{type:'null'},{encoding:fixed('null')}),
 scalar('integer',20,'decimal_integer',decimal,{encoding:fixed('signed-int64-le'),bits:fixed(64),bytes_le:bytes},{decimal}),
 scalar('real',5,'binary64_decimal',str,{encoding:fixed('ieee754-binary64-le'),bits:fixed(64),bytes_le:bytes},{decimal:str}),
 scalar('string',8,'native_string',str,{encoding:fixed('utf8'),utf8_hex:{type:'string',pattern:'^(?:[a-f0-9]{2})*$'}}),
 scalar('boolean',11,'native_boolean',{type:'boolean'},{encoding:fixed('boolean8'),bytes_le:{type:'string',enum:['00','01']}}),
 scalar('datetime',7,'native_oadate_binary64_le',bytes,{encoding:fixed('oadate-binary64-le'),bits:fixed(64),bytes_le:bytes,
  temporal_profile:fixed('loginom-7.4.2-native-oadate'),semantic_scope:fixed('native_serial_only'),civil_time_verified:fixed(false),epoch_verified:fixed(false)},
 {decimal:str,timezone:fixed('unspecified')}),
]};
export const nativePortProperties={
 exact_table:obj({rows:{type:'array',maxItems:50,items:{type:'array',minItems:1,maxItems:8,items:nativeCellSchema}},complete:fixed(true)}),
 read_coverage:obj({cells_read:{...integer,maximum:400},rows_read:{...integer,maximum:50},columns_read:{...integer,maximum:8},table_complete:fixed(true)}),
 read_consistency:obj({kind:fixed('observed_local'),changed:fixed(false),exclusive_operation:fixed(true),stability_basis:fixed('owned_static_completed_fixture'),atomic_snapshot:fixed(false),unobserved_aba_excluded:fixed(false)}),
 binding:obj({read_id:str,document_id:str,workflow_id:str,package_id:str,node_id:str,port_guid:str,execution:obj({status:fixed('completed'),execution_id:str})}),
 cell_precision:obj({cells:fixed('exact_native'),temporal:fixed('native_serial_only')}),
 limitations:{type:'array',items:str},
};
