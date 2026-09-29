import {CROSSTABLE_FUNCTIONS} from './crosstable-parameters.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};

// CrossTable materializes its derived fields only when the node executes. The
// initial inline output mapping is empty; its separate port receives the fresh
// schema after execution. Keep the normal graph lifecycle and verify that
// schema while reading the exact new output table.
export async function deferCrossTableOutput(_channel,configuration,parameters,mappings){
 need(mappings.length===0,'CrossTable output mappings cannot precede the generated schema');
 return {verified:true,cleanup_complete:true,effect_possible:false,ports:[{port:0,deferred_until_execution:true}],
  configuration,parameters};
}

export function resolveCrossTableOutputSchema(configuration,parameters,columns){
 need(Array.isArray(columns)&&columns.length>0&&columns.length<=1000,'Complete bounded CrossTable output schema required');
 const source=configuration.input_fields.filter(field=>!field.is_count_case),byIndex=index=>{
  const matches=source.filter(field=>field.source_index===index);need(matches.length===1,'CrossTable source index differs');return matches[0];
 };
 const rows=parameters.rows.map(ref=>source.find(field=>field.name===ref.name));
 need(rows.every(Boolean),'CrossTable row source disappeared');
 need(rows.every((field,index)=>columns[index]?.name===field.name&&columns[index]?.type===field.type),
  'CrossTable output row keys differ');
 const functions=['sum','min','max','avg'];
 const measures=parameters.facts.flatMap(fact=>functions.filter(fn=>fact.functions.includes(fn)).map(fn=>({
  field:source.find(item=>item.name===fact.field.name),fn,definition:CROSSTABLE_FUNCTIONS[fn],
 })));
 need(measures.every(measure=>measure.field&&measure.definition),'CrossTable fact source disappeared');
 const generated=columns.slice(rows.length);
 need(generated.length>0&&generated.length%measures.length===0,'CrossTable generated width differs');
 const count=generated.length/measures.length;
 need(count>0&&count<=128,'CrossTable category width exceeds the verified bound');
 const categories=[];
 for(let index=1;index<=count;index++){
  const names=[];
  for(const measure of measures){
   const name=`C_${index}_${measure.field.name}_${measure.definition.suffix}`;
   const matches=generated.filter(column=>column.name===name);
   need(matches.length===1&&['integer','real'].includes(matches[0].type),
    'CrossTable output field or numeric type differs: '+name);
   const suffix='|'+measure.field.label+'|'+measure.definition.label;
   need(typeof matches[0].label==='string'&&matches[0].label.endsWith(suffix),'CrossTable output label differs: '+name);
   const category=matches[0].label.slice(0,-suffix.length);
   need(category.length>0,'CrossTable category label is empty');
   names.push(category);
  }
  need(new Set(names).size===1,'CrossTable category and fact labels disagree');
  categories.push(names[0]);
 }
 need(new Set(categories).size===categories.length,'CrossTable category labels are ambiguous');
 const ordered=categories.flatMap((category,index)=>measures.map(measure=>({
   name:`C_${index+1}_${measure.field.name}_${measure.definition.suffix}`,
   label:category+'|'+measure.field.label+'|'+measure.definition.label})));
 need(generated.every((column,index)=>column.name===ordered[index].name&&column.label===ordered[index].label),
  'CrossTable output field order differs');
 if(parameters.columns.mode==='fixed'){
  need((categories[0]==='<...>')===parameters.columns.include_null,'Fixed CrossTable NULL group differs');
  need((categories.at(-1)==='<Прочее>')===parameters.columns.include_other,'Fixed CrossTable Other group differs');
 }
 need(new Set(generated.map(column=>column.name)).size===generated.length,'CrossTable generated field names collide');
 need(generated.length===count*measures.length,'CrossTable generated fields are incomplete');
 return {categories,fields:columns.map(column=>({name:column.name,label:column.label,type:column.type})),
  category_mapping:categories.map((category,index)=>({category,index:index+1,
   facts:measures.map(measure=>({field:measure.field.name,function:measure.fn,
    name:`C_${index+1}_${measure.field.name}_${measure.definition.suffix}`}))}))};
}

export async function readCrossTableOutputs(channel,read,context,deferred){
 need(deferred?.verified===true&&deferred.ports?.length===1&&deferred.ports[0].deferred_until_execution,
  'CrossTable deferred schema checkpoint missing');
 const table=await openNewOutputTable(channel,0),format=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
 let settings,raw,data,schema,restoration;
 try{
  settings=await prepareTableRead(channel,table.table);
  raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
  schema=resolveCrossTableOutputSchema(deferred.configuration,deferred.parameters,raw.columns);
  data=decodeTableOutput(raw,{formatProof:format,readSettings:settings,expectedColumns:schema.fields,
   requireExactNumbers:read.require_exact_numbers});
 }finally{if(format)restoration=await restoreTablePrecision(channel,format);}
 const returned=await returnFromOutputTable(channel,table.table);
 return {verified:true,cleanup_complete:true,effect_possible:true,status:data.sample_complete?'complete':'partial',
  execution_id:context.execution.execution_id,evidence_ref:context.receipt_id,
  ports:[{port:0,port_guid:table.port_guid,fresh:true,execution_id:context.execution.execution_id,
   ...data,category_mapping:schema.category_mapping}],
  table_creation:table,format_proof:format,format_restoration:restoration,read_settings:settings,workflow_return:returned};
}
